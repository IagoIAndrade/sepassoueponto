CREATE OR REPLACE FUNCTION public.admin_upsert_fund_config(
  p_title text,
  p_total_amount numeric,
  p_due_date date,
  p_notes text,
  p_is_active boolean,
  p_scope text DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_fund_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid := p_fund_id;
  v_prev public.equipment_funds%ROWTYPE;
  v_title text;
  v_amount numeric(10,2);
  v_notes text;
  v_action text;
  v_scope text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  v_title := btrim(COALESCE(p_title,''));
  IF length(v_title) < 2 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE='22023';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE='22023';
  END IF;

  v_amount := round(p_total_amount::numeric, 2);
  v_notes := NULLIF(btrim(COALESCE(p_notes,'')), '');

  IF v_target IS NOT NULL THEN
    SELECT * INTO v_prev
      FROM public.equipment_funds
     WHERE id = v_target
     FOR UPDATE;

    IF v_prev.id IS NULL THEN
      RAISE EXCEPTION 'invalid_fund' USING ERRCODE='22023';
    END IF;

    v_scope := COALESCE(p_scope, v_prev.scope, 'global');
    IF v_scope NOT IN ('global','group') THEN
      RAISE EXCEPTION 'invalid_scope' USING ERRCODE='22023';
    END IF;

    IF v_scope = 'group' AND COALESCE(array_length(p_group_ids, 1), 0) = 0 THEN
      RAISE EXCEPTION 'invalid_groups' USING ERRCODE='22023';
    END IF;

    UPDATE public.equipment_funds
       SET title = v_title,
           total_amount = v_amount,
           due_date = p_due_date,
           notes = v_notes,
           is_active = COALESCE(p_is_active, true),
           scope = v_scope,
           updated_at = now()
     WHERE id = v_target;

    IF p_group_ids IS NOT NULL OR v_scope = 'global' THEN
      DELETE FROM public.fund_groups WHERE fund_id = v_target;
      IF v_scope = 'group' THEN
        INSERT INTO public.fund_groups (fund_id, group_id)
        SELECT v_target, g.id
          FROM public.groups g
         WHERE g.id = ANY(COALESCE(p_group_ids,'{}'::uuid[]))
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    v_action := CASE
      WHEN COALESCE(p_is_active,true) = false AND v_prev.is_active = true THEN 'fund_deactivated'
      ELSE 'fund_updated'
    END;

    INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
    VALUES (
      v_uid,
      v_action,
      'equipment_fund',
      v_target,
      jsonb_build_object('title', v_title, 'total_amount', v_amount, 'scope', v_scope)
    );

    RETURN jsonb_build_object('ok', true, 'fund_id', v_target, 'action', v_action);
  END IF;

  v_scope := COALESCE(p_scope,'global');
  IF v_scope NOT IN ('global','group') THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE='22023';
  END IF;

  IF v_scope = 'group' AND COALESCE(array_length(p_group_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'invalid_groups' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.equipment_funds (title, total_amount, due_date, notes, is_active, created_by, scope)
  VALUES (v_title, v_amount, p_due_date, v_notes, COALESCE(p_is_active,true), v_uid, v_scope)
  RETURNING id INTO v_target;

  IF v_scope = 'group' THEN
    INSERT INTO public.fund_groups (fund_id, group_id)
    SELECT v_target, g.id
      FROM public.groups g
     WHERE g.id = ANY(COALESCE(p_group_ids,'{}'::uuid[]))
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (
    v_uid,
    'fund_created',
    'equipment_fund',
    v_target,
    jsonb_build_object('title', v_title, 'total_amount', v_amount, 'scope', v_scope)
  );

  RETURN jsonb_build_object('ok', true, 'fund_id', v_target, 'action', 'fund_created');
END;
$$;
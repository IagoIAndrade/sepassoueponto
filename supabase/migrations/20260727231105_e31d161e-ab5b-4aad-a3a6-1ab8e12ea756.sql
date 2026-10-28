-- ===== turmas para o admin =====
CREATE OR REPLACE FUNCTION public.admin_list_groups()
RETURNS TABLE(id uuid, slug text, name text, active boolean, sort_order int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY SELECT g.id, g.slug, g.name, g.active, g.sort_order FROM public.groups g ORDER BY g.sort_order;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_player_groups(p_player_id uuid, p_group_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  DELETE FROM public.player_groups pg
   WHERE pg.player_id = p_player_id
     AND NOT (pg.group_id = ANY(COALESCE(p_group_ids,'{}'::uuid[])));

  INSERT INTO public.player_groups (player_id, group_id)
  SELECT p_player_id, g.id FROM public.groups g
  WHERE g.id = ANY(COALESCE(p_group_ids,'{}'::uuid[]))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid,'admin_set_player_groups','player', p_player_id,
          jsonb_build_object('group_ids', COALESCE(p_group_ids,'{}'::uuid[])));

  RETURN jsonb_build_object('ok', true);
END; $$;

-- ===== rodadas por turma =====
DROP FUNCTION IF EXISTS public.admin_list_events();
CREATE FUNCTION public.admin_list_events(p_group_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, event_date date, status event_status, opens_at timestamptz, start_time time,
              end_time time, location text, main_limit integer, is_current boolean, is_next boolean,
              group_id uuid, group_name text, main_count int, wait_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_today date; v_current uuid; v_current_date date; v_next uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF p_group_id IS NOT NULL THEN
    SELECT e.id, e.event_date INTO v_current, v_current_date
    FROM public.volleyball_events e
    WHERE e.group_id = p_group_id AND e.status IN ('scheduled','open','closed') AND e.event_date >= v_today
    ORDER BY e.event_date ASC LIMIT 1;

    IF v_current IS NOT NULL THEN
      SELECT e.id INTO v_next FROM public.volleyball_events e
      WHERE e.group_id = p_group_id AND e.status IN ('scheduled','open','closed') AND e.event_date > v_current_date
      ORDER BY e.event_date ASC LIMIT 1;
    END IF;
  END IF;

  RETURN QUERY
  SELECT e.id, e.event_date, e.status, e.opens_at, e.start_time, e.end_time, e.location, e.main_limit,
         (e.id = v_current), (e.id = v_next), e.group_id, g.name,
         COALESCE((SELECT count(*)::int FROM public.registrations r
                   WHERE r.event_id = e.id AND r.cancelled_at IS NULL AND r.list_type='main'),0),
         COALESCE((SELECT count(*)::int FROM public.registrations r
                   WHERE r.event_id = e.id AND r.cancelled_at IS NULL AND r.list_type='wait'),0)
  FROM public.volleyball_events e
  JOIN public.groups g ON g.id = e.group_id
  WHERE p_group_id IS NULL OR e.group_id = p_group_id
  ORDER BY e.event_date DESC
  LIMIT 100;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_event_status(p_event_id uuid, p_status event_status, p_manual_override boolean, p_admin_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_gid uuid; v_default_priority int; v_effective_opens_at timestamptz; v_effective_priority int;
BEGIN
  SELECT group_id INTO v_gid FROM public.volleyball_events WHERE id = p_event_id;
  IF v_gid IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;

  SELECT priority_minutes INTO v_default_priority FROM public.app_settings WHERE group_id = v_gid;

  v_effective_priority := COALESCE(v_default_priority, 0);
  v_effective_opens_at := now();

  UPDATE public.volleyball_events
     SET status = p_status,
         manual_override = p_manual_override,
         opens_at = CASE WHEN p_status = 'open' THEN v_effective_opens_at ELSE opens_at END,
         priority_minutes = CASE WHEN p_status = 'open' THEN v_effective_priority ELSE priority_minutes END
   WHERE id = p_event_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_set_event_status','event', p_event_id,
    jsonb_build_object('status', p_status,'manual_override', p_manual_override,'group_id', v_gid));
END; $$;

-- ===== adicionar jogador respeitando a turma =====
CREATE OR REPLACE FUNCTION public.admin_add_player(p_event_id uuid, p_target_player_id uuid, p_list_type list_type, p_admin_user_id uuid, p_force_override boolean DEFAULT false)
RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_event public.volleyball_events; v_pos int; v_reg uuid; v_blocked boolean; v_main_cnt int;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND active) THEN
    RAISE EXCEPTION 'player_not_available'; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN RAISE EXCEPTION 'already_registered'; END IF;
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;
  IF p_list_type = 'main' THEN
    SELECT count(*) INTO v_main_cnt FROM public.registrations r
     WHERE r.event_id = p_event_id AND r.list_type='main' AND r.cancelled_at IS NULL;
    IF v_main_cnt >= v_event.main_limit THEN RAISE EXCEPTION 'main_full'; END IF;
    v_pos := v_main_cnt + 1;
  ELSE
    SELECT coalesce(max(r.position_number),0)+1 INTO v_pos FROM public.registrations r
     WHERE r.event_id = p_event_id AND r.list_type='wait' AND r.cancelled_at IS NULL;
  END IF;
  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number)
  VALUES (p_event_id, p_target_player_id, p_target_player_id, p_list_type, v_pos)
  RETURNING id INTO v_reg;

  INSERT INTO public.player_groups (player_id, group_id) VALUES (p_target_player_id, v_event.group_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_add_player','registration', v_reg,
          jsonb_build_object('event_id', p_event_id,'player_id', p_target_player_id,
                             'list_type', p_list_type,'force', p_force_override,'group_id', v_event.group_id));
  out_registration_id := v_reg; out_list_type := p_list_type; out_position_number := v_pos; RETURN NEXT;
END; $$;

-- ===== bloqueios com abrangência =====
CREATE OR REPLACE FUNCTION public.internal_process_active_block(p_block_id uuid, p_admin_user_id uuid, p_fail_after integer DEFAULT NULL::integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_block public.player_blocks; v_evt record; v_reg public.registrations; v_wait public.registrations;
  v_next_pos int; v_processed int := 0;
BEGIN
  SELECT * INTO v_block FROM public.player_blocks WHERE id = p_block_id;
  IF v_block.id IS NULL OR NOT v_block.active THEN RAISE EXCEPTION 'block_not_found_or_inactive'; END IF;

  FOR v_evt IN
    SELECT e.id, e.event_date, e.group_id
      FROM public.volleyball_events e
     WHERE e.event_date BETWEEN v_block.starts_at AND v_block.ends_at
       AND e.status NOT IN ('completed','cancelled')
       AND (v_block.scope = 'global' OR v_block.group_id IS NULL OR e.group_id = v_block.group_id)
       AND EXISTS (SELECT 1 FROM public.registrations r
                    WHERE r.event_id = e.id AND r.player_id = v_block.player_id AND r.cancelled_at IS NULL)
     ORDER BY e.event_date ASC, e.id ASC
  LOOP
    PERFORM public.lock_event(v_evt.id);
    SELECT * INTO v_reg FROM public.registrations
     WHERE event_id = v_evt.id AND player_id = v_block.player_id AND cancelled_at IS NULL LIMIT 1;
    IF v_reg.id IS NULL THEN CONTINUE; END IF;

    UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL WHERE id = v_reg.id;

    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id,'block_cancel_registration','registration', v_reg.id,
            jsonb_build_object('block_id', p_block_id,'event_id', v_evt.id,'player_id', v_block.player_id,
                               'from_list', v_reg.list_type,'from_pos', v_reg.position_number));

    IF v_reg.list_type = 'main' THEN
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_evt.id AND list_type='main' AND cancelled_at IS NULL AND position_number > v_reg.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_evt.id AND list_type='main' AND cancelled_at IS NULL AND position_number > 100000;

      LOOP
        SELECT * INTO v_wait FROM public.registrations
         WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL
         ORDER BY position_number ASC LIMIT 1;
        EXIT WHEN v_wait.id IS NULL;

        IF public.internal_is_blocked(v_wait.player_id, v_evt.event_date, v_evt.group_id) THEN
          UPDATE public.registrations SET cancelled_at = now() WHERE id = v_wait.id;
          UPDATE public.registrations SET position_number = position_number + 100000
           WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL AND position_number > v_wait.position_number;
          UPDATE public.registrations SET position_number = position_number - 100001
           WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL AND position_number > 100000;
          INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
          VALUES (p_admin_user_id,'skip_blocked_on_promote','registration', v_wait.id,
                  jsonb_build_object('event_id', v_evt.id,'block_id', p_block_id));
          CONTINUE;
        END IF;

        SELECT coalesce(max(position_number),0)+1 INTO v_next_pos FROM public.registrations
         WHERE event_id = v_evt.id AND list_type='main' AND cancelled_at IS NULL;
        UPDATE public.registrations SET list_type='main', position_number = v_next_pos WHERE id = v_wait.id;
        UPDATE public.registrations SET position_number = position_number + 100000
         WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL AND position_number > v_wait.position_number;
        UPDATE public.registrations SET position_number = position_number - 100001
         WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL AND position_number > 100000;
        EXIT;
      END LOOP;
    ELSE
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL AND position_number > v_reg.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_evt.id AND list_type='wait' AND cancelled_at IS NULL AND position_number > 100000;
    END IF;

    v_processed := v_processed + 1;
    IF p_fail_after IS NOT NULL AND v_processed >= p_fail_after THEN
      RAISE EXCEPTION 'forced_failure_after_%_events', v_processed;
    END IF;
  END LOOP;

  RETURN v_processed;
END; $$;

DROP FUNCTION IF EXISTS public.admin_block_player(uuid, date, date, text, text, uuid);
CREATE FUNCTION public.admin_block_player(p_player_id uuid, p_starts_at date, p_ends_at date, p_reason text,
                                          p_admin_notes text, p_admin_user_id uuid,
                                          p_group_id uuid DEFAULT NULL, p_scope text DEFAULT 'group')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id uuid; v_processed int; v_scope text := COALESCE(p_scope,'group'); v_gid uuid;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'invalid_block_range'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'player_not_found'; END IF;
  IF v_scope NOT IN ('group','global') THEN RAISE EXCEPTION 'invalid_scope'; END IF;

  IF v_scope = 'group' THEN
    v_gid := COALESCE(p_group_id, public.internal_default_group_id());
  ELSE
    v_gid := NULL;
  END IF;

  INSERT INTO public.player_blocks
    (player_id, starts_at, ends_at, reason, admin_notes, created_by_admin_user_id, group_id, scope)
  VALUES (p_player_id, p_starts_at, p_ends_at, p_reason, p_admin_notes, p_admin_user_id, v_gid, v_scope)
  RETURNING id INTO v_id;

  v_processed := public.internal_process_active_block(v_id, p_admin_user_id, NULL);

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_block_player','player_block', v_id,
          jsonb_build_object('player_id', p_player_id,'starts_at', p_starts_at,'ends_at', p_ends_at,
                             'scope', v_scope,'group_id', v_gid,'registrations_cancelled', v_processed));
  RETURN v_id;
END; $$;

-- ===== rateios: abrangência =====
DROP FUNCTION IF EXISTS public.admin_get_fund_config();
CREATE FUNCTION public.admin_get_fund_config(p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid(); v_active jsonb; v_history jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(f.*) || jsonb_build_object(
           'group_ids', COALESCE((SELECT jsonb_agg(fg.group_id) FROM public.fund_groups fg WHERE fg.fund_id = f.id),'[]'::jsonb))
    INTO v_active
    FROM public.equipment_funds f
   WHERE f.is_active = true
     AND (p_group_id IS NULL OR public.internal_fund_applies_to_group(f.id, p_group_id))
   ORDER BY (f.scope='group') DESC, f.created_at ASC
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(f.*) || jsonb_build_object(
           'group_ids', COALESCE((SELECT jsonb_agg(fg.group_id) FROM public.fund_groups fg WHERE fg.fund_id = f.id),'[]'::jsonb))
           ORDER BY f.updated_at DESC), '[]'::jsonb)
    INTO v_history
    FROM public.equipment_funds f
   WHERE f.is_active = false;

  RETURN jsonb_build_object('active', v_active, 'history', v_history);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_funds(p_filter text DEFAULT 'all', p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid(); v_rows jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(f.*) || jsonb_build_object(
           'group_ids', COALESCE((SELECT jsonb_agg(fg.group_id) FROM public.fund_groups fg WHERE fg.fund_id=f.id),'[]'::jsonb))
           ORDER BY f.is_active DESC, f.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.equipment_funds f
   WHERE CASE
           WHEN p_filter = 'shared' THEN f.scope = 'global'
           WHEN p_filter = 'group'  THEN f.scope = 'group'
                                          AND EXISTS (SELECT 1 FROM public.fund_groups fg
                                                      WHERE fg.fund_id=f.id AND fg.group_id = p_group_id)
           ELSE true
         END;

  RETURN jsonb_build_object('funds', v_rows);
END; $$;

DROP FUNCTION IF EXISTS public.admin_upsert_fund_config(text, numeric, date, text, boolean);
CREATE FUNCTION public.admin_upsert_fund_config(p_title text, p_total_amount numeric, p_due_date date,
                                                p_notes text, p_is_active boolean,
                                                p_scope text DEFAULT NULL, p_group_ids uuid[] DEFAULT NULL,
                                                p_fund_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_target uuid; v_prev public.equipment_funds%ROWTYPE;
  v_title text; v_amount numeric(10,2); v_notes text; v_action text; v_scope text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  v_title := btrim(COALESCE(p_title,''));
  IF length(v_title) < 2 THEN RAISE EXCEPTION 'invalid_title' USING ERRCODE='22023'; END IF;
  IF p_total_amount IS NULL OR p_total_amount < 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE='22023'; END IF;
  v_amount := round(p_total_amount::numeric, 2);
  v_notes := NULLIF(btrim(COALESCE(p_notes,'')), '');

  v_target := p_fund_id;
  IF v_target IS NULL THEN
    SELECT id INTO v_target FROM public.equipment_funds WHERE is_active = true ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_target IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.equipment_funds WHERE id = v_target;
    v_scope := COALESCE(p_scope, v_prev.scope, 'global');
    IF v_scope NOT IN ('global','group') THEN RAISE EXCEPTION 'invalid_scope'; END IF;

    UPDATE public.equipment_funds
       SET title = v_title, total_amount = v_amount, due_date = p_due_date, notes = v_notes,
           is_active = COALESCE(p_is_active, true), scope = v_scope, updated_at = now()
     WHERE id = v_target;

    IF p_group_ids IS NOT NULL OR v_scope = 'global' THEN
      DELETE FROM public.fund_groups WHERE fund_id = v_target;
      IF v_scope = 'group' THEN
        INSERT INTO public.fund_groups (fund_id, group_id)
        SELECT v_target, g.id FROM public.groups g WHERE g.id = ANY(COALESCE(p_group_ids,'{}'::uuid[]))
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    v_action := CASE WHEN COALESCE(p_is_active,true) = false AND v_prev.is_active = true
                     THEN 'fund_deactivated' ELSE 'fund_updated' END;

    INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
    VALUES (v_uid, v_action,'equipment_fund', v_target,
      jsonb_build_object('title', v_title,'total_amount', v_amount,'scope', v_scope));

    RETURN jsonb_build_object('ok', true,'fund_id', v_target,'action', v_action);
  END IF;

  v_scope := COALESCE(p_scope,'global');
  IF v_scope NOT IN ('global','group') THEN RAISE EXCEPTION 'invalid_scope'; END IF;

  INSERT INTO public.equipment_funds (title, total_amount, due_date, notes, is_active, created_by, scope)
  VALUES (v_title, v_amount, p_due_date, v_notes, COALESCE(p_is_active,true), v_uid, v_scope)
  RETURNING id INTO v_target;

  IF v_scope = 'group' THEN
    INSERT INTO public.fund_groups (fund_id, group_id)
    SELECT v_target, g.id FROM public.groups g WHERE g.id = ANY(COALESCE(p_group_ids,'{}'::uuid[]))
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid,'fund_created','equipment_fund', v_target,
          jsonb_build_object('title', v_title,'total_amount', v_amount,'scope', v_scope));

  RETURN jsonb_build_object('ok', true,'fund_id', v_target,'action','fund_created');
END; $$;
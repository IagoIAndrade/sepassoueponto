
-- Lote R4: RPCs administrativas para pagamentos do rateio

-- 1) Listar movimentações (vinculadas e avulsas)
CREATE OR REPLACE FUNCTION public.admin_list_fund_payments(
  p_fund_id uuid DEFAULT NULL,
  p_participant_id uuid DEFAULT NULL,
  p_kind text DEFAULT NULL,           -- 'all' | 'linked' | 'anon' | NULL
  p_search text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_lim int := pg_catalog.least(pg_catalog.greatest(COALESCE(p_limit, 200), 1), 500);
  v_kind text := COALESCE(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_kind,'all'))), 'all');
  v_search text := NULLIF(pg_catalog.btrim(COALESCE(p_search,'')), '');
  v_items jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('fund_id', NULL, 'items', '[]'::jsonb, 'total_count', 0);
  END IF;

  IF v_kind NOT IN ('all','linked','anon') THEN
    v_kind := 'all';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', fp.id,
        'fund_id', fp.fund_id,
        'participant_id', fp.participant_id,
        'participant_name', part.name,
        'payer_name', fp.payer_name,
        'display_name', COALESCE(part.name, fp.payer_name),
        'kind', CASE WHEN fp.participant_id IS NOT NULL THEN 'linked' ELSE 'anon' END,
        'amount', fp.amount,
        'paid_at', fp.paid_at,
        'payment_method', fp.payment_method,
        'notes', fp.notes,
        'created_by', fp.created_by,
        'updated_by', fp.updated_by,
        'created_at', fp.created_at,
        'updated_at', fp.updated_at
      )
      ORDER BY fp.paid_at DESC, fp.created_at DESC
    ), '[]'::jsonb) INTO v_items
  FROM (
    SELECT p.*
    FROM public.fund_payments p
    LEFT JOIN public.fund_participants fp2 ON fp2.id = p.participant_id
    WHERE p.fund_id = v_fund_id
      AND (p_participant_id IS NULL OR p.participant_id = p_participant_id)
      AND (
        v_kind = 'all'
        OR (v_kind = 'linked' AND p.participant_id IS NOT NULL)
        OR (v_kind = 'anon'   AND p.participant_id IS NULL)
      )
      AND (p_from IS NULL OR p.paid_at >= p_from)
      AND (p_to   IS NULL OR p.paid_at <= p_to)
      AND (
        v_search IS NULL
        OR pg_catalog.lower(COALESCE(p.payer_name,'')) LIKE '%' || pg_catalog.lower(v_search) || '%'
        OR pg_catalog.lower(COALESCE(fp2.name,''))     LIKE '%' || pg_catalog.lower(v_search) || '%'
      )
    ORDER BY p.paid_at DESC, p.created_at DESC
    LIMIT v_lim
  ) fp
  LEFT JOIN public.fund_participants part ON part.id = fp.participant_id;

  RETURN pg_catalog.jsonb_build_object(
    'fund_id', v_fund_id,
    'items', v_items,
    'limit', v_lim
  );
END;
$$;

-- 2) Obter pagamento
CREATE OR REPLACE FUNCTION public.admin_get_fund_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.fund_payments%ROWTYPE;
  v_part_name text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payment' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.fund_payments WHERE id = p_payment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.participant_id IS NOT NULL THEN
    SELECT name INTO v_part_name FROM public.fund_participants WHERE id = v_row.participant_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'fund_id', v_row.fund_id,
    'participant_id', v_row.participant_id,
    'participant_name', v_part_name,
    'payer_name', v_row.payer_name,
    'amount', v_row.amount,
    'paid_at', v_row.paid_at,
    'payment_method', v_row.payment_method,
    'notes', v_row.notes,
    'created_by', v_row.created_by,
    'updated_by', v_row.updated_by,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

-- 3) Criar pagamento (vinculado ou avulso)
CREATE OR REPLACE FUNCTION public.admin_add_fund_payment(
  p_fund_id uuid,
  p_participant_id uuid,
  p_payer_name text,
  p_amount numeric,
  p_paid_at date,
  p_payment_method text,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_amount numeric(10,2);
  v_payer text;
  v_method text;
  v_notes text;
  v_paid_at date;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- fund_id resolvido: parâmetro, ou do participante, ou ativo
  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL AND p_participant_id IS NOT NULL THEN
    SELECT fund_id INTO v_fund_id FROM public.fund_participants WHERE id = p_participant_id;
  END IF;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'fund_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- valida participante pertence ao fund
  IF p_participant_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.fund_participants WHERE id = p_participant_id AND fund_id = v_fund_id) THEN
      RAISE EXCEPTION 'participant_not_in_fund' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_payer := NULLIF(pg_catalog.btrim(COALESCE(p_payer_name,'')), '');
  IF p_participant_id IS NULL AND v_payer IS NULL THEN
    RAISE EXCEPTION 'payer_name_required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  v_amount := pg_catalog.round(p_amount::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'invalid_paid_at' USING ERRCODE = '22023';
  END IF;
  v_paid_at := p_paid_at;

  v_method := NULLIF(pg_catalog.btrim(COALESCE(p_payment_method,'')), '');
  v_notes  := NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')), '');

  INSERT INTO public.fund_payments(
    fund_id, participant_id, payer_name, amount, paid_at,
    payment_method, notes, created_by, updated_by
  ) VALUES (
    v_fund_id, p_participant_id, v_payer, v_amount, v_paid_at,
    v_method, v_notes, v_uid, v_uid
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_payment_created', 'fund_payment', v_new_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_fund_id,
      'payment_id', v_new_id,
      'participant_id', p_participant_id,
      'payer_name', v_payer,
      'amount', v_amount,
      'paid_at', v_paid_at,
      'payment_method', v_method
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'payment_id', v_new_id, 'fund_id', v_fund_id);
END;
$$;

-- 4) Atualizar pagamento
CREATE OR REPLACE FUNCTION public.admin_update_fund_payment(
  p_payment_id uuid,
  p_participant_id uuid,
  p_payer_name text,
  p_amount numeric,
  p_paid_at date,
  p_payment_method text,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.fund_payments%ROWTYPE;
  v_amount numeric(10,2);
  v_payer text;
  v_method text;
  v_notes text;
  v_paid_at date;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payment' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prev FROM public.fund_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_prev.id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- participante alvo deve pertencer ao mesmo fund
  IF p_participant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.fund_participants WHERE id = p_participant_id AND fund_id = v_prev.fund_id
    ) THEN
      RAISE EXCEPTION 'participant_not_in_fund' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_payer := NULLIF(pg_catalog.btrim(COALESCE(p_payer_name,'')), '');
  IF p_participant_id IS NULL AND v_payer IS NULL THEN
    RAISE EXCEPTION 'payer_name_required' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  v_amount := pg_catalog.round(p_amount::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'invalid_paid_at' USING ERRCODE = '22023';
  END IF;
  v_paid_at := p_paid_at;

  v_method := NULLIF(pg_catalog.btrim(COALESCE(p_payment_method,'')), '');
  v_notes  := NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')), '');

  UPDATE public.fund_payments SET
    participant_id = p_participant_id,
    payer_name     = v_payer,
    amount         = v_amount,
    paid_at        = v_paid_at,
    payment_method = v_method,
    notes          = v_notes,
    updated_by     = v_uid,
    updated_at     = pg_catalog.now()
  WHERE id = p_payment_id;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_payment_updated', 'fund_payment', p_payment_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_prev.fund_id,
      'payment_id', p_payment_id,
      'before', pg_catalog.jsonb_build_object(
        'participant_id', v_prev.participant_id,
        'payer_name', v_prev.payer_name,
        'amount', v_prev.amount,
        'paid_at', v_prev.paid_at,
        'payment_method', v_prev.payment_method
      ),
      'after', pg_catalog.jsonb_build_object(
        'participant_id', p_participant_id,
        'payer_name', v_payer,
        'amount', v_amount,
        'paid_at', v_paid_at,
        'payment_method', v_method
      )
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'payment_id', p_payment_id);
END;
$$;

-- 5) Excluir pagamento
CREATE OR REPLACE FUNCTION public.admin_delete_fund_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.fund_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payment' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prev FROM public.fund_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_prev.id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Log com snapshot completo ANTES de excluir
  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_payment_deleted', 'fund_payment', p_payment_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_prev.fund_id,
      'payment_id', p_payment_id,
      'snapshot', pg_catalog.jsonb_build_object(
        'participant_id', v_prev.participant_id,
        'payer_name', v_prev.payer_name,
        'amount', v_prev.amount,
        'paid_at', v_prev.paid_at,
        'payment_method', v_prev.payment_method,
        'notes', v_prev.notes,
        'created_by', v_prev.created_by,
        'created_at', v_prev.created_at
      )
    ));

  DELETE FROM public.fund_payments WHERE id = p_payment_id;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'payment_id', p_payment_id, 'fund_id', v_prev.fund_id);
END;
$$;

-- ACLs: revogar de PUBLIC/anon; conceder EXECUTE apenas a authenticated (bloqueio interno para não-admin)
REVOKE ALL ON FUNCTION public.admin_list_fund_payments(uuid, uuid, text, text, date, date, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_fund_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_fund_payment(uuid, uuid, text, numeric, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_fund_payment(uuid, uuid, text, numeric, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_fund_payment(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_fund_payments(uuid, uuid, text, text, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_fund_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_fund_payment(uuid, uuid, text, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_fund_payment(uuid, uuid, text, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_fund_payment(uuid) TO authenticated;

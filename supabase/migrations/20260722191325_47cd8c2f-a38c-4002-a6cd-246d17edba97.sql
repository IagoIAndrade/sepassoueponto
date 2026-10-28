
-- =====================================================================
-- Lote R3: Participantes financeiros, vínculos e status calculado
-- =====================================================================

-- Helper interno: normaliza estado (participates/exempt/agreed_amount)
-- Retorna um record; usado só por outras funções deste arquivo.
CREATE OR REPLACE FUNCTION public.internal_normalize_fund_state(
  p_participates boolean,
  p_exempt boolean,
  p_agreed_amount numeric
) RETURNS TABLE(participates boolean, exempt boolean, agreed_amount numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_amt numeric;
BEGIN
  IF p_participates IS NULL THEN
    RAISE EXCEPTION 'invalid_participates' USING ERRCODE = '22023';
  END IF;

  -- Não participa: força exempt=false, agreed=NULL
  IF p_participates = false THEN
    participates := false; exempt := false; agreed_amount := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- Isento: força agreed=NULL
  IF COALESCE(p_exempt, false) = true THEN
    participates := true; exempt := true; agreed_amount := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- Participa não isento
  IF p_agreed_amount IS NULL THEN
    -- A definir
    participates := true; exempt := false; agreed_amount := NULL;
    RETURN NEXT; RETURN;
  END IF;

  v_amt := pg_catalog.round(p_agreed_amount::numeric, 2);
  IF v_amt < 0 THEN
    RAISE EXCEPTION 'invalid_amount_negative' USING ERRCODE = '22023';
  END IF;
  IF v_amt = 0 THEN
    RAISE EXCEPTION 'invalid_amount_zero_for_non_exempt' USING ERRCODE = '22023';
  END IF;

  participates := true; exempt := false; agreed_amount := v_amt;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_normalize_fund_state(boolean, boolean, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_normalize_fund_state(boolean, boolean, numeric) FROM anon;

-- Helper interno: calcula status financeiro por participante.
-- Retorna record com paid, balance, credit, status.
CREATE OR REPLACE FUNCTION public.internal_fund_participant_status(
  p_participates boolean,
  p_exempt boolean,
  p_agreed_amount numeric,
  p_paid numeric
) RETURNS TABLE(paid numeric, balance numeric, credit numeric, status text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_paid numeric := COALESCE(p_paid, 0);
BEGIN
  paid := v_paid;

  IF p_participates = false THEN
    balance := 0; credit := v_paid; status := 'not_participating'; RETURN NEXT; RETURN;
  END IF;

  IF p_exempt = true THEN
    balance := 0; credit := v_paid; status := 'exempt'; RETURN NEXT; RETURN;
  END IF;

  IF p_agreed_amount IS NULL THEN
    balance := 0; credit := v_paid; status := 'to_define'; RETURN NEXT; RETURN;
  END IF;

  balance := pg_catalog.greatest(p_agreed_amount - v_paid, 0);
  credit  := pg_catalog.greatest(v_paid - p_agreed_amount, 0);

  IF v_paid = 0 THEN
    status := 'pending';
  ELSIF v_paid < p_agreed_amount THEN
    status := 'partial';
  ELSIF v_paid = p_agreed_amount THEN
    status := 'in_full';
  ELSE
    status := 'overpaid';
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_fund_participant_status(boolean, boolean, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_fund_participant_status(boolean, boolean, numeric, numeric) FROM anon;

-- =====================================================================
-- admin_list_fund_participants
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_list_fund_participants(
  p_fund_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_search text;
  v_status text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('fund_id', NULL, 'items', '[]'::jsonb);
  END IF;

  v_search := NULLIF(pg_catalog.btrim(pg_catalog.lower(COALESCE(p_search, ''))), '');
  v_status := NULLIF(pg_catalog.btrim(COALESCE(p_status, '')), '');

  WITH paid_agg AS (
    SELECT participant_id, COALESCE(pg_catalog.sum(amount), 0)::numeric(10,2) AS total_paid
    FROM public.fund_payments
    WHERE fund_id = v_fund_id AND participant_id IS NOT NULL
    GROUP BY participant_id
  ),
  players_agg AS (
    SELECT fpp.participant_id,
           pg_catalog.count(DISTINCT fpp.player_id)::int AS players_count,
           COALESCE(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'player_id', pl.id,
                 'name', pl.name,
                 'phone_normalized', pl.phone_normalized,
                 'active', pl.active
               ) ORDER BY pl.name
             ), '[]'::jsonb) AS players
    FROM public.fund_participant_players fpp
    JOIN public.players pl ON pl.id = fpp.player_id
    WHERE fpp.fund_id = v_fund_id
    GROUP BY fpp.participant_id
  ),
  base AS (
    SELECT p.*,
           COALESCE(pa.total_paid, 0)::numeric(10,2) AS total_paid,
           COALESCE(pla.players_count, 0) AS players_count,
           COALESCE(pla.players, '[]'::jsonb) AS players
    FROM public.fund_participants p
    LEFT JOIN paid_agg pa ON pa.participant_id = p.id
    LEFT JOIN players_agg pla ON pla.participant_id = p.id
    WHERE p.fund_id = v_fund_id
  ),
  scored AS (
    SELECT b.*, s.balance, s.credit, s.status
    FROM base b,
    LATERAL public.internal_fund_participant_status(b.participates, b.exempt, b.agreed_amount, b.total_paid) s
  ),
  filtered AS (
    SELECT * FROM scored s
    WHERE (v_search IS NULL
       OR pg_catalog.lower(s.name) LIKE '%' || v_search || '%'
       OR pg_catalog.lower(COALESCE(s.phone, '')) LIKE '%' || v_search || '%'
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(s.players) pl
         WHERE pg_catalog.lower(pl->>'name') LIKE '%' || v_search || '%'
       )
    )
    AND (v_status IS NULL OR (
       CASE v_status
         WHEN 'no_link' THEN s.players_count = 0
         WHEN 'one_link' THEN s.players_count = 1
         WHEN 'many_links' THEN s.players_count > 1
         WHEN 'not_participating' THEN s.status = 'not_participating'
         WHEN 'exempt' THEN s.status = 'exempt'
         WHEN 'to_define' THEN s.status = 'to_define'
         WHEN 'pending' THEN s.status = 'pending'
         WHEN 'partial' THEN s.status = 'partial'
         WHEN 'in_full' THEN s.status = 'in_full'
         WHEN 'overpaid' THEN s.status = 'overpaid'
         ELSE true
       END
    ))
  )
  SELECT pg_catalog.jsonb_build_object(
    'fund_id', v_fund_id,
    'items', COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'phone', f.phone,
        'participates', f.participates,
        'exempt', f.exempt,
        'agreed_amount', f.agreed_amount,
        'notes', f.notes,
        'total_paid', f.total_paid,
        'balance', f.balance,
        'credit', f.credit,
        'status', f.status,
        'players_count', f.players_count,
        'players', f.players,
        'created_at', f.created_at,
        'updated_at', f.updated_at
      ) ORDER BY pg_catalog.lower(f.name)
    ), '[]'::jsonb)
  ) INTO v_result
  FROM filtered f;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_fund_participants(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_fund_participants(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_fund_participants(uuid, text, text) TO authenticated;

-- =====================================================================
-- admin_get_fund_participant
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_get_fund_participant(
  p_participant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.fund_participants%ROWTYPE;
  v_paid numeric(10,2) := 0;
  v_players jsonb := '[]'::jsonb;
  v_status_row record;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_participant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_participant' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_p FROM public.fund_participants WHERE id = p_participant_id;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'participant_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(pg_catalog.sum(amount), 0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments
  WHERE fund_id = v_p.fund_id AND participant_id = v_p.id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'player_id', pl.id, 'name', pl.name, 'phone_normalized', pl.phone_normalized, 'active', pl.active
      ) ORDER BY pl.name
    ), '[]'::jsonb) INTO v_players
  FROM public.fund_participant_players fpp
  JOIN public.players pl ON pl.id = fpp.player_id
  WHERE fpp.fund_id = v_p.fund_id AND fpp.participant_id = v_p.id;

  SELECT * INTO v_status_row
    FROM public.internal_fund_participant_status(v_p.participates, v_p.exempt, v_p.agreed_amount, v_paid);

  RETURN pg_catalog.jsonb_build_object(
    'id', v_p.id, 'fund_id', v_p.fund_id, 'name', v_p.name, 'phone', v_p.phone,
    'participates', v_p.participates, 'exempt', v_p.exempt,
    'agreed_amount', v_p.agreed_amount, 'notes', v_p.notes,
    'total_paid', v_status_row.paid, 'balance', v_status_row.balance,
    'credit', v_status_row.credit, 'status', v_status_row.status,
    'players', v_players,
    'created_at', v_p.created_at, 'updated_at', v_p.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_fund_participant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_fund_participant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fund_participant(uuid) TO authenticated;

-- =====================================================================
-- admin_create_fund_participant
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_create_fund_participant(
  p_fund_id uuid,
  p_name text,
  p_phone text,
  p_participates boolean,
  p_exempt boolean,
  p_agreed_amount numeric,
  p_notes text,
  p_link_player_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_name text; v_phone text; v_notes text;
  v_norm record;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'fund_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_name := pg_catalog.btrim(COALESCE(p_name, ''));
  IF pg_catalog.length(v_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  v_phone := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_notes := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'notes_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_norm FROM public.internal_normalize_fund_state(p_participates, p_exempt, p_agreed_amount);

  INSERT INTO public.fund_participants(
    fund_id, name, phone, participates, exempt, agreed_amount, notes, created_by, updated_by
  ) VALUES (
    v_fund_id, v_name, v_phone, v_norm.participates, v_norm.exempt, v_norm.agreed_amount, v_notes, v_uid, v_uid
  ) RETURNING id INTO v_id;

  -- Vínculo opcional (mesma transação)
  IF p_link_player_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_link_player_id) THEN
      RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
    END IF;
    BEGIN
      INSERT INTO public.fund_participant_players(fund_id, participant_id, player_id, created_by)
      VALUES (v_fund_id, v_id, p_link_player_id, v_uid);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'player_already_linked' USING ERRCODE = '23505';
    END;
  END IF;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_participant_created', 'fund_participant', v_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_fund_id,
      'after', pg_catalog.jsonb_build_object(
        'name', v_name, 'phone', v_phone,
        'participates', v_norm.participates, 'exempt', v_norm.exempt,
        'agreed_amount', v_norm.agreed_amount, 'notes', v_notes
      ),
      'linked_player_id', p_link_player_id
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'participant_id', v_id, 'fund_id', v_fund_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_fund_participant(uuid, text, text, boolean, boolean, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_fund_participant(uuid, text, text, boolean, boolean, numeric, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_fund_participant(uuid, text, text, boolean, boolean, numeric, text, uuid) TO authenticated;

-- =====================================================================
-- admin_update_fund_participant
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_update_fund_participant(
  p_participant_id uuid,
  p_name text,
  p_phone text,
  p_participates boolean,
  p_exempt boolean,
  p_agreed_amount numeric,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.fund_participants%ROWTYPE;
  v_name text; v_phone text; v_notes text;
  v_norm record;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_participant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_participant' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prev FROM public.fund_participants WHERE id = p_participant_id FOR UPDATE;
  IF v_prev.id IS NULL THEN
    RAISE EXCEPTION 'participant_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_name := pg_catalog.btrim(COALESCE(p_name, ''));
  IF pg_catalog.length(v_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  v_phone := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_notes := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'notes_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_norm FROM public.internal_normalize_fund_state(p_participates, p_exempt, p_agreed_amount);

  UPDATE public.fund_participants
     SET name = v_name, phone = v_phone,
         participates = v_norm.participates, exempt = v_norm.exempt,
         agreed_amount = v_norm.agreed_amount, notes = v_notes,
         updated_by = v_uid, updated_at = pg_catalog.now()
   WHERE id = p_participant_id;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_participant_updated', 'fund_participant', p_participant_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_prev.fund_id,
      'before', pg_catalog.jsonb_build_object(
        'name', v_prev.name, 'phone', v_prev.phone,
        'participates', v_prev.participates, 'exempt', v_prev.exempt,
        'agreed_amount', v_prev.agreed_amount, 'notes', v_prev.notes
      ),
      'after', pg_catalog.jsonb_build_object(
        'name', v_name, 'phone', v_phone,
        'participates', v_norm.participates, 'exempt', v_norm.exempt,
        'agreed_amount', v_norm.agreed_amount, 'notes', v_notes
      )
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'participant_id', p_participant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_fund_participant(uuid, text, text, boolean, boolean, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_fund_participant(uuid, text, text, boolean, boolean, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_fund_participant(uuid, text, text, boolean, boolean, numeric, text) TO authenticated;

-- =====================================================================
-- admin_search_players_for_fund_link
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_search_players_for_fund_link(
  p_fund_id uuid,
  p_search text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_q text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('items', '[]'::jsonb);
  END IF;

  v_q := NULLIF(pg_catalog.btrim(pg_catalog.lower(COALESCE(p_search, ''))), '');
  IF v_q IS NOT NULL AND pg_catalog.length(v_q) < 2 THEN
    RETURN pg_catalog.jsonb_build_object('items', '[]'::jsonb);
  END IF;

  SELECT pg_catalog.jsonb_build_object('items', COALESCE(pg_catalog.jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT pg_catalog.jsonb_build_object(
      'player_id', p.id,
      'name', p.name,
      'phone_normalized', p.phone_normalized,
      'active', p.active,
      'linked_participant_id', fpp.participant_id,
      'linked_participant_name', fp.name
    ) AS x
    FROM public.players p
    LEFT JOIN public.fund_participant_players fpp
      ON fpp.player_id = p.id AND fpp.fund_id = v_fund_id
    LEFT JOIN public.fund_participants fp
      ON fp.id = fpp.participant_id
    WHERE (v_q IS NULL OR pg_catalog.lower(p.name) LIKE '%' || v_q || '%'
        OR pg_catalog.lower(COALESCE(p.phone_normalized, '')) LIKE '%' || v_q || '%')
    ORDER BY p.name
    LIMIT 50
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_players_for_fund_link(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_players_for_fund_link(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_search_players_for_fund_link(uuid, text) TO authenticated;

-- =====================================================================
-- admin_link_player_to_fund_participant
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_link_player_to_fund_participant(
  p_fund_id uuid,
  p_participant_id uuid,
  p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_participant_id IS NULL OR p_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_link_args' USING ERRCODE = '22023';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT fund_id INTO v_fund_id FROM public.fund_participants WHERE id = p_participant_id;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'fund_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fund_participants WHERE id = p_participant_id AND fund_id = v_fund_id) THEN
    RAISE EXCEPTION 'participant_not_in_fund' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO public.fund_participant_players(fund_id, participant_id, player_id, created_by)
    VALUES (v_fund_id, p_participant_id, p_player_id, v_uid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'player_already_linked' USING ERRCODE = '23505';
  END;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_player_linked', 'fund_participant', p_participant_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_fund_id, 'participant_id', p_participant_id, 'player_id', p_player_id
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'fund_id', v_fund_id,
    'participant_id', p_participant_id, 'player_id', p_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_link_player_to_fund_participant(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_link_player_to_fund_participant(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_link_player_to_fund_participant(uuid, uuid, uuid) TO authenticated;

-- =====================================================================
-- admin_unlink_player_from_fund_participant
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_unlink_player_from_fund_participant(
  p_fund_id uuid,
  p_participant_id uuid,
  p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_deleted int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_participant_id IS NULL OR p_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_link_args' USING ERRCODE = '22023';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT fund_id INTO v_fund_id FROM public.fund_participants WHERE id = p_participant_id;
  END IF;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'fund_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.fund_participant_players
   WHERE fund_id = v_fund_id AND participant_id = p_participant_id AND player_id = p_player_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_player_unlinked', 'fund_participant', p_participant_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_fund_id, 'participant_id', p_participant_id, 'player_id', p_player_id
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unlink_player_from_fund_participant(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unlink_player_from_fund_participant(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unlink_player_from_fund_participant(uuid, uuid, uuid) TO authenticated;

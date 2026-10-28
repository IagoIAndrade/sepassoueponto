
-- R1.2: Fechamento final da modelagem financeira

-- 1) FKs: bloquear exclusão em cascata que apagaria histórico
ALTER TABLE public.fund_participants
  DROP CONSTRAINT fund_participants_fund_id_fkey,
  ADD CONSTRAINT fund_participants_fund_id_fkey
    FOREIGN KEY (fund_id) REFERENCES public.equipment_funds(id) ON DELETE RESTRICT;

ALTER TABLE public.fund_participant_players
  DROP CONSTRAINT fund_participant_players_fund_id_fkey,
  ADD CONSTRAINT fund_participant_players_fund_id_fkey
    FOREIGN KEY (fund_id) REFERENCES public.equipment_funds(id) ON DELETE RESTRICT;

-- 2) CHECK completo de estados coerentes
ALTER TABLE public.fund_participants
  DROP CONSTRAINT IF EXISTS fund_participants_exempt_requires_participates;

ALTER TABLE public.fund_participants
  ADD CONSTRAINT fund_participants_state_coherent CHECK (
    (participates = false AND exempt = false AND agreed_amount IS NULL)
    OR
    (participates = true AND exempt = true AND (agreed_amount IS NULL OR agreed_amount = 0))
    OR
    (participates = true AND exempt = false AND (agreed_amount IS NULL OR agreed_amount > 0))
  );

-- 3) Endurecer internal_validate_session: qualificar objetos e remover pg_temp
CREATE OR REPLACE FUNCTION public.internal_validate_session(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_sess uuid;
  v_player uuid;
  v_remember boolean;
  v_abs timestamptz;
  v_new_exp timestamptz;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN NULL; END IF;

  SELECT id, player_id, remember, absolute_expires_at
    INTO v_sess, v_player, v_remember, v_abs
  FROM public.player_sessions
  WHERE token_hash = public.hash_token(p_token)
    AND revoked_at IS NULL
    AND expires_at > pg_catalog.now()
    AND absolute_expires_at > pg_catalog.now();

  IF v_player IS NULL THEN RETURN NULL; END IF;

  IF v_remember THEN
    v_new_exp := pg_catalog.now() + interval '30 days';
    IF v_new_exp > v_abs THEN v_new_exp := v_abs; END IF;
    UPDATE public.player_sessions
       SET last_used_at = pg_catalog.now(),
           expires_at = v_new_exp
     WHERE id = v_sess;
  ELSE
    UPDATE public.player_sessions
       SET last_used_at = pg_catalog.now()
     WHERE id = v_sess;
  END IF;

  RETURN v_player;
END;
$function$;

-- Garantir ACL: sem PUBLIC/anon/authenticated
REVOKE ALL ON FUNCTION public.internal_validate_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_validate_session(text) FROM anon;
REVOKE ALL ON FUNCTION public.internal_validate_session(text) FROM authenticated;

-- 0. Limpeza prévia
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_phone_normalized_key;
DROP INDEX IF EXISTS public.players_phone_normalized_key;
DROP FUNCTION IF EXISTS public.normalize_phone(text);

-- 1. Função de normalização
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_phone text;
BEGIN
    IF p_phone IS NULL THEN RETURN NULL; END IF;
    v_phone := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone) >= 12 AND v_phone LIKE '55%' THEN v_phone := substr(v_phone, 3); END IF;
    RETURN v_phone;
END;
$$;

-- 2. Garantir coluna e atualizar
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'phone_normalized') THEN
        ALTER TABLE public.players ADD COLUMN phone_normalized text;
    END IF;
END $$;

UPDATE public.players SET phone_normalized = public.normalize_phone(phone);

-- 3. Consolidar Duplicados com tratamento de conflitos
DO $$
DECLARE
    r RECORD;
    v_primary_id uuid;
BEGIN
    FOR r IN (SELECT phone_normalized FROM public.players GROUP BY phone_normalized HAVING count(*) > 1) LOOP
        SELECT id INTO v_primary_id FROM public.players WHERE phone_normalized = r.phone_normalized ORDER BY active DESC, created_at ASC LIMIT 1;

        -- player_groups
        UPDATE public.player_groups pg SET player_id = v_primary_id FROM public.players p WHERE pg.player_id = p.id AND p.phone_normalized = r.phone_normalized AND p.id <> v_primary_id AND NOT EXISTS (SELECT 1 FROM public.player_groups pg2 WHERE pg2.player_id = v_primary_id AND pg2.group_id = pg.group_id);
        
        -- registrations
        UPDATE public.registrations SET player_id = v_primary_id WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        UPDATE public.registrations SET registered_by_player_id = v_primary_id WHERE registered_by_player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        UPDATE public.registrations SET cancelled_by_player_id = v_primary_id WHERE cancelled_by_player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);

        -- fund_participant_players (Tratando o conflito UNIQUE)
        UPDATE public.fund_participant_players fpp SET player_id = v_primary_id FROM public.players p WHERE fpp.player_id = p.id AND p.phone_normalized = r.phone_normalized AND p.id <> v_primary_id AND NOT EXISTS (SELECT 1 FROM public.fund_participant_players fpp2 WHERE fpp2.player_id = v_primary_id AND fpp2.fund_id = fpp.fund_id);

        -- Outros
        UPDATE public.player_skills SET player_id = v_primary_id WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id) AND NOT EXISTS (SELECT 1 FROM public.player_skills WHERE player_id = v_primary_id);
        UPDATE public.player_incidents SET player_id = v_primary_id WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        UPDATE public.player_blocks SET player_id = v_primary_id WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        UPDATE public.event_attendance SET player_id = v_primary_id WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        UPDATE public.player_sessions SET player_id = v_primary_id WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);

        -- Limpeza
        DELETE FROM public.fund_participant_players WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        DELETE FROM public.player_groups WHERE player_id IN (SELECT id FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id);
        DELETE FROM public.players WHERE phone_normalized = r.phone_normalized AND id <> v_primary_id;
    END LOOP;
END $$;

-- 4. Unicidade final
ALTER TABLE public.players ALTER COLUMN phone_normalized SET NOT NULL;
DROP INDEX IF EXISTS players_phone_normalized_uidx;
CREATE UNIQUE INDEX players_phone_normalized_uidx ON public.players (phone_normalized);

-- 5. RPC Signup
CREATE OR REPLACE FUNCTION public.internal_signup_player_v2(p_first_name text, p_last_name text, p_phone text, p_pin text, p_group_ids uuid[], p_ip text, p_user_agent text, p_remember boolean)
RETURNS TABLE (player_id uuid, token_plain text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone_norm text; v_player_id uuid; v_token_plain text; v_token_hash text; v_group_id uuid;
BEGIN
    v_phone_norm := public.normalize_phone(p_phone);
    SELECT id INTO v_player_id FROM public.players WHERE phone_normalized = v_phone_norm;
    IF v_player_id IS NOT NULL THEN RAISE EXCEPTION 'Este telefone já possui cadastro. Entre com sua conta ou utilize a recuperação de acesso.'; END IF;
    INSERT INTO public.players (name, phone, phone_normalized, pin_hash, active) VALUES (trim(p_first_name || ' ' || p_last_name), p_phone, v_phone_norm, crypt(p_pin, gen_salt('bf')), true) RETURNING id INTO v_player_id;
    FOREACH v_group_id IN ARRAY p_group_ids LOOP INSERT INTO public.player_groups (player_id, group_id, status) VALUES (v_player_id, v_group_id, 'pending'); END LOOP;
    v_token_plain := encode(gen_random_bytes(32), 'hex'); v_token_hash := public.hash_token(v_token_plain);
    INSERT INTO public.player_sessions (player_id, token_hash, ip, user_agent, remember, expires_at, absolute_expires_at) VALUES (v_player_id, v_token_hash, p_ip::inet, p_user_agent, p_remember, CASE WHEN p_remember THEN now() + interval '30 days' ELSE now() + interval '2 hours' END, now() + interval '90 days');
    RETURN QUERY SELECT v_player_id, v_token_plain;
END;
$$;

-- 6. RPC Access Request
CREATE OR REPLACE FUNCTION public.player_request_group_access(p_token text, p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_player_id uuid; v_status text;
BEGIN
    SELECT public.internal_validate_session(p_token) INTO v_player_id;
    IF v_player_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    SELECT status INTO v_status FROM public.player_groups WHERE player_id = v_player_id AND group_id = p_group_id;
    IF v_status = 'pending' THEN RAISE EXCEPTION 'Você já possui uma solicitação pendente para esta turma.';
    ELSIF v_status = 'approved' THEN RAISE EXCEPTION 'Você já possui acesso a esta turma.';
    ELSIF v_status IS NOT NULL THEN UPDATE public.player_groups SET status = 'pending', requested_at = now(), processed_at = NULL, rejection_reason = NULL WHERE player_id = v_player_id AND group_id = p_group_id;
    ELSE INSERT INTO public.player_groups (player_id, group_id, status) VALUES (v_player_id, p_group_id, 'pending'); END IF;
END;
$$;

-- 1. Tabela de pedidos de acesso (solicitações)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_group_status') THEN
        CREATE TYPE public.player_group_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
    END IF;
END
$$;

-- Adiciona colunas de status e metadados à tabela player_groups para transformá-la no registro oficial de permissão
ALTER TABLE public.player_groups 
  ADD COLUMN IF NOT EXISTS status public.player_group_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Garante que jogadores existentes (migrados anteriormente) fiquem como 'approved'
UPDATE public.player_groups SET status = 'approved' WHERE status = 'pending';

-- 2. Atualização da tabela de jogadores para suportar Nome e Sobrenome
ALTER TABLE public.players 
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Backfill: tenta quebrar o nome atual em dois (primeira palavra = nome, resto = sobrenome)
UPDATE public.players 
SET first_name = split_part(name, ' ', 1),
    last_name = CASE 
      WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL;

-- 3. Nova RPC para cadastro com solicitações de turma
CREATE OR REPLACE FUNCTION public.internal_signup_player_v2(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_pin text,
  p_group_ids uuid[],
  p_ip inet,
  p_user_agent text,
  p_remember boolean DEFAULT false
)
RETURNS TABLE(player_id uuid, session_id uuid, token_plain text, expires_at timestamptz, absolute_expires_at timestamptz, remember boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_phone text;
  v_pid uuid;
  v_sess uuid;
  v_tok text;
  v_exp timestamptz;
  v_abs timestamptz;
  v_ttl int;
  v_gid uuid;
BEGIN
  -- Validações básicas
  IF p_first_name IS NULL OR length(btrim(p_first_name)) < 2 THEN RAISE EXCEPTION 'invalid_first_name'; END IF;
  IF p_group_ids IS NULL OR array_length(p_group_ids, 1) = 0 THEN RAISE EXCEPTION 'at_least_one_group_required'; END IF;
  
  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 8 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  
  -- Verifica se já existe
  IF EXISTS (SELECT 1 FROM public.players WHERE phone_normalized = v_phone) THEN
    RAISE EXCEPTION 'phone_already_registered';
  END IF;

  -- Insere jogador
  INSERT INTO public.players (name, first_name, last_name, phone, phone_normalized, pin_hash)
  VALUES (btrim(p_first_name || ' ' || COALESCE(p_last_name, '')), btrim(p_first_name), btrim(COALESCE(p_last_name, '')), p_phone, v_phone, public.hash_pin(p_pin))
  RETURNING id INTO v_pid;

  -- Registra solicitações de turma
  FOREACH v_gid IN ARRAY p_group_ids LOOP
    INSERT INTO public.player_groups (player_id, group_id, status)
    VALUES (v_pid, v_gid, 'pending');
  END LOOP;

  -- Cria sessão
  v_ttl := CASE WHEN p_remember THEN 720 ELSE 8 END;
  SELECT s.session_id, s.token_plain, s.expires_at, s.absolute_expires_at
    INTO v_sess, v_tok, v_exp, v_abs
  FROM public.internal_create_session(v_pid, p_ip, p_user_agent, v_ttl, p_remember, 2160) s;

  player_id := v_pid;
  session_id := v_sess;
  token_plain := v_tok;
  expires_at := v_exp;
  absolute_expires_at := v_abs;
  remember := p_remember;
  RETURN NEXT;
END;
$function$;

-- 4. RPC para o administrador gerenciar aprovações
CREATE OR REPLACE FUNCTION public.admin_process_group_request(
  p_player_id uuid,
  p_group_id uuid,
  p_status public.player_group_status,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.player_groups
  SET status = p_status,
      processed_at = now(),
      processed_by = v_admin,
      rejection_reason = p_reason
  WHERE player_id = p_player_id AND group_id = p_group_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'process_group_request', 'player', p_player_id, 
          jsonb_build_object('group_id', p_group_id, 'status', p_status, 'reason', p_reason));
END;
$function$;

-- 5. RPC para listar aprovações pendentes
CREATE OR REPLACE FUNCTION public.admin_list_pending_approvals(
  p_group_id uuid DEFAULT NULL,
  p_status public.player_group_status DEFAULT 'pending',
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  player_id uuid,
  first_name text,
  last_name text,
  phone_normalized text,
  group_id uuid,
  group_name text,
  status public.player_group_status,
  requested_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT 
    p.id, p.first_name, p.last_name, p.phone_normalized,
    g.id, g.name, pg.status, pg.requested_at
  FROM public.player_groups pg
  JOIN public.players p ON p.id = pg.player_id
  JOIN public.groups g ON g.id = pg.group_id
  WHERE (p_group_id IS NULL OR pg.group_id = p_group_id)
    AND (p_status IS NULL OR pg.status = p_status)
    AND (p_search IS NULL OR p.name_normalized ILIKE '%' || lower(btrim(p_search)) || '%' OR p.phone_normalized ILIKE '%' || p_search || '%')
  ORDER BY pg.requested_at DESC;
END;
$function$;

-- 6. RPC para o jogador ver seus próprios acessos
CREATE OR REPLACE FUNCTION public.get_my_group_accesses(p_token text)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  status public.player_group_status,
  rejection_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_pid uuid;
BEGIN
  v_pid := public.internal_validate_session(p_token);
  IF v_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT g.id, g.name, pg.status, pg.rejection_reason
  FROM public.player_groups pg
  JOIN public.groups g ON g.id = pg.group_id
  WHERE pg.player_id = v_pid;
END;
$function$;

-- 7. RPC para solicitar acesso a uma nova turma (jogador logado)
CREATE OR REPLACE FUNCTION public.player_request_group_access(p_token text, p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_pid uuid;
BEGIN
  v_pid := public.internal_validate_session(p_token);
  IF v_pid IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;

  INSERT INTO public.player_groups (player_id, group_id, status)
  VALUES (v_pid, p_group_id, 'pending')
  ON CONFLICT (player_id, group_id) DO UPDATE 
  SET status = 'pending', requested_at = now() 
  WHERE public.player_groups.status IN ('rejected', 'suspended');
END;
$function$;

-- 8. Grants
GRANT EXECUTE ON FUNCTION public.internal_signup_player_v2(text, text, text, text, uuid[], inet, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_process_group_request(uuid, uuid, public.player_group_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_approvals(uuid, public.player_group_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_group_accesses(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.player_request_group_access(text, uuid) TO service_role;

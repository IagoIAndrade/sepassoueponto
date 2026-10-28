-- Corrigir a função admin_request_pin_reset para realmente resetar o PIN para o padrão
CREATE OR REPLACE FUNCTION public.admin_request_pin_reset(p_player_id uuid, p_admin_user_id uuid)
 RETURNS TABLE(player_id uuid, revoked_sessions integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 DECLARE v_revoked int := 0;
 BEGIN
   IF NOT public.has_role(p_admin_user_id, 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
   
   -- Resetar o PIN para o padrão '123456' ao solicitar o reset
   UPDATE public.players 
   SET pin_hash = public.hash_pin('123456'), 
       must_change_pin = true, 
       updated_at = now() 
   WHERE id = p_player_id;
   
   IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found'; END IF;
   
   WITH d AS (DELETE FROM public.player_sessions ps WHERE ps.player_id = p_player_id RETURNING 1)
   SELECT count(*)::int INTO v_revoked FROM d;
   
   player_id := p_player_id;
   revoked_sessions := v_revoked;
   RETURN NEXT;
 END; $function$;

-- Executar o reset agora para o jogador afetado para garantir que ele consiga entrar
SELECT public.admin_request_pin_reset('aaee0eb3-95fc-404d-bded-14dc9a64b025', (SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1));

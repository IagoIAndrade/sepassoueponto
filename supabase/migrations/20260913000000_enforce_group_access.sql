-- supabase/migrations/20260913000000_enforce_group_access.sql

-- Garante que a RPC de leitura de status e o DB estejam alinhados.
-- Esta migration reforça ou preserva a lógica do banco para recuperar corretamente as informações
-- de acesso por turma para os logs de auditoria.

CREATE OR REPLACE FUNCTION public.get_my_group_accesses(p_token text)
 RETURNS TABLE(group_id uuid, group_name text, status player_group_status, rejection_reason text, has_priority boolean, is_organizer boolean, is_suspended boolean, suspension_reason text, suspended_until date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pid uuid;
BEGIN
  v_pid := public.internal_validate_session(p_token);
  IF v_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT 
    g.id, 
    g.name, 
    pg.status, 
    pg.rejection_reason, 
    pg.has_priority, 
    pg.is_organizer,
    COALESCE((SELECT true FROM public.player_blocks pb WHERE pb.player_id = v_pid AND pb.active = true AND pb.ends_at >= CURRENT_DATE AND (pb.scope = 'global' OR pb.group_id = g.id) LIMIT 1), false) as is_suspended,
    (SELECT pb.reason FROM public.player_blocks pb WHERE pb.player_id = v_pid AND pb.active = true AND pb.ends_at >= CURRENT_DATE AND (pb.scope = 'global' OR pb.group_id = g.id) ORDER BY pb.ends_at DESC LIMIT 1) as suspension_reason,
    (SELECT pb.ends_at FROM public.player_blocks pb WHERE pb.player_id = v_pid AND pb.active = true AND pb.ends_at >= CURRENT_DATE AND (pb.scope = 'global' OR pb.group_id = g.id) ORDER BY pb.ends_at DESC LIMIT 1) as suspended_until
  FROM public.player_groups pg
  JOIN public.groups g ON g.id = pg.group_id
  WHERE pg.player_id = v_pid;
END;
$function$;

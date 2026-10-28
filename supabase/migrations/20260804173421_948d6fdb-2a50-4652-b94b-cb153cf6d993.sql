CREATE OR REPLACE FUNCTION public.admin_save_reviewed_accesses_v2(
  p_player_ids uuid[],
  p_group_ids uuid[],
  p_action text DEFAULT 'approve',
  p_admin_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pid uuid;
  v_gid uuid;
BEGIN
  IF p_action NOT IN ('approve','remove') THEN
    RAISE EXCEPTION 'Ação inválida: %', p_action;
  END IF;

  FOREACH v_pid IN ARRAY p_player_ids LOOP
    FOREACH v_gid IN ARRAY p_group_ids LOOP
      IF p_action = 'approve' THEN
        INSERT INTO player_groups (player_id, group_id, status, processed_at, processed_by)
        VALUES (v_pid, v_gid, 'approved', now(), p_admin_id)
        ON CONFLICT (player_id, group_id) DO UPDATE
          SET status = 'approved',
              processed_at = now(),
              processed_by = p_admin_id,
              rejection_reason = NULL;
      ELSE
        UPDATE player_groups
           SET status = 'rejected',
               processed_at = now(),
               processed_by = p_admin_id
         WHERE player_id = v_pid AND group_id = v_gid;
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_save_reviewed_accesses_v2(uuid[], uuid[], text, uuid) TO service_role;
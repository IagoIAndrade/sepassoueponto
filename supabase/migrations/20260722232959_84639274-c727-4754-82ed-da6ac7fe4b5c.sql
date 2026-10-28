DROP FUNCTION IF EXISTS public.get_public_fund_player_statuses();

CREATE OR REPLACE FUNCTION public.get_public_fund_player_statuses()
RETURNS TABLE(player_id uuid, status text, has_paid boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH f AS (
    SELECT id FROM public.equipment_funds WHERE is_active = true LIMIT 1
  ),
  agg AS (
    SELECT
      fp.id AS participant_id,
      fp.participates,
      fp.exempt,
      fp.agreed_amount,
      COALESCE((
        SELECT SUM(pay.amount)
        FROM public.fund_payments pay
        WHERE pay.fund_id = (SELECT id FROM f) AND pay.participant_id = fp.id
      ), 0)::numeric(10,2) AS paid
    FROM public.fund_participants fp
    WHERE fp.fund_id = (SELECT id FROM f)
  ),
  computed AS (
    SELECT
      participant_id,
      CASE
        WHEN NOT participates THEN 'not_participating'
        WHEN exempt THEN 'exempt'
        WHEN agreed_amount IS NULL THEN 'to_define'
        WHEN paid = 0 THEN 'pending'
        WHEN paid < agreed_amount THEN 'partial'
        WHEN paid = agreed_amount THEN 'in_full'
        ELSE 'overpaid'
      END AS status,
      (paid > 0) AS has_paid
    FROM agg
  )
  SELECT fpp.player_id, c.status, c.has_paid
  FROM public.fund_participant_players fpp
  JOIN computed c ON c.participant_id = fpp.participant_id
  WHERE fpp.fund_id = (SELECT id FROM f);
$function$;

REVOKE ALL ON FUNCTION public.get_public_fund_player_statuses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_fund_player_statuses() TO anon, authenticated, service_role;
-- R5

DROP FUNCTION IF EXISTS public.get_public_registrations(uuid);

CREATE FUNCTION public.get_public_registrations(p_event_id uuid)
RETURNS TABLE(
  player_id uuid,
  player_name text,
  list_type list_type,
  position_number integer,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, p.name, r.list_type, r.position_number, r.created_at
  FROM public.registrations r
  JOIN public.players p ON p.id = r.player_id
  WHERE r.event_id = p_event_id AND r.cancelled_at IS NULL
  ORDER BY r.list_type, r.position_number;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_registrations(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_fund_player_statuses()
RETURNS TABLE(player_id uuid, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
      END AS status
    FROM agg
  )
  SELECT fpp.player_id, c.status
  FROM public.fund_participant_players fpp
  JOIN computed c ON c.participant_id = fpp.participant_id
  WHERE fpp.fund_id = (SELECT id FROM f);
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_fund_player_statuses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_fund_player_statuses() TO anon, authenticated;

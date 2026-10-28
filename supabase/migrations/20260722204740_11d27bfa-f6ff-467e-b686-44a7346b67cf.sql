-- R5 fechamento: remove `notes` do contrato público do resumo do rateio
-- e adiciona indicador `is_active` explícito.

DROP FUNCTION IF EXISTS public.get_public_fund_summary();

CREATE FUNCTION public.get_public_fund_summary()
RETURNS TABLE(
  fund_id uuid,
  title text,
  total_amount numeric,
  due_date date,
  total_collected numeric,
  remaining_balance numeric,
  surplus_amount numeric,
  percent_collected numeric,
  is_active boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH f AS (
    SELECT id, title, total_amount, due_date, is_active
    FROM public.equipment_funds
    WHERE is_active = true
    LIMIT 1
  ), agg AS (
    SELECT COALESCE(SUM(p.amount), 0)::numeric(10,2) AS total_collected
    FROM public.fund_payments p
    JOIN f ON f.id = p.fund_id
  )
  SELECT
    f.id,
    f.title,
    f.total_amount,
    f.due_date,
    agg.total_collected,
    GREATEST(0, f.total_amount - agg.total_collected)::numeric(10,2) AS remaining_balance,
    GREATEST(0, agg.total_collected - f.total_amount)::numeric(10,2) AS surplus_amount,
    CASE
      WHEN f.total_amount > 0 THEN ROUND((agg.total_collected / f.total_amount) * 100, 2)
      ELSE 0
    END AS percent_collected,
    f.is_active
  FROM f, agg;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_fund_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_fund_summary() TO anon, authenticated;
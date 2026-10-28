
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

  balance := greatest(p_agreed_amount - v_paid, 0::numeric);
  credit  := greatest(v_paid - p_agreed_amount, 0::numeric);

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

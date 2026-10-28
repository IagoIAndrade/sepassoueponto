UPDATE public.equipment_funds
SET is_active = true,
    scope = 'global',
    updated_at = now()
WHERE id = '74989239-d74b-4f45-94f4-80c329463312';

DELETE FROM public.fund_groups WHERE fund_id = '74989239-d74b-4f45-94f4-80c329463312';
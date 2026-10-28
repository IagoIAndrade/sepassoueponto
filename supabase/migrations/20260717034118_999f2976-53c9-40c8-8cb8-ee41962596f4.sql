
-- 1) Reescreve tick_events: apenas abertura automática, sem criar novas rodadas
CREATE OR REPLACE FUNCTION public.tick_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Abertura automática: rodadas programadas sem override manual cujo opens_at já passou
  UPDATE public.volleyball_events
     SET status = 'open'
   WHERE status = 'scheduled'
     AND manual_override = false
     AND opens_at IS NOT NULL
     AND opens_at <= now();
END;
$$;

-- 2) Limpeza dos artefatos de teste
DELETE FROM public.volleyball_events WHERE event_date = '2099-12-25' AND location = '_probe_';
DROP FUNCTION IF EXISTS public._test_probe_insert_event(date);

-- 3) Revoga grants temporários
REVOKE EXECUTE ON FUNCTION public.internal_compute_next_round() FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.admin_preview_next_event() FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.admin_create_next_event_v2() FROM supabase_read_only_user;
REVOKE EXECUTE ON FUNCTION public.admin_list_events() FROM supabase_read_only_user;

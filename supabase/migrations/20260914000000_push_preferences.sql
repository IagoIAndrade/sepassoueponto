CREATE TABLE IF NOT EXISTS public.player_push_preferences (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  group_ids uuid[] DEFAULT '{}'::uuid[],
  notify_registration_open boolean DEFAULT true,
  notify_guest_release boolean DEFAULT true,
  notify_promoted boolean DEFAULT true,
  notify_event_changed boolean DEFAULT true,
  notify_access_approved boolean DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.player_push_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.player_push_preferences TO anon;
GRANT ALL ON public.player_push_preferences TO service_role;

ALTER TABLE public.player_push_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push preferences" ON public.player_push_preferences;
CREATE POLICY "Users can view their own push preferences" ON public.player_push_preferences
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own push preferences" ON public.player_push_preferences;
CREATE POLICY "Users can insert their own push preferences" ON public.player_push_preferences
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own push preferences" ON public.player_push_preferences;
CREATE POLICY "Users can update their own push preferences" ON public.player_push_preferences
  FOR UPDATE USING (true);

DROP TRIGGER IF EXISTS player_push_preferences_updated ON public.player_push_preferences;
CREATE TRIGGER player_push_preferences_updated
  BEFORE UPDATE ON public.player_push_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

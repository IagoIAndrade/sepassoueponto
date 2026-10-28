-- 1. Create the table
CREATE TABLE public.registration_withdrawals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid REFERENCES public.volleyball_events(id) ON DELETE CASCADE NOT NULL,
    group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    registration_id uuid NOT NULL,
    player_id uuid REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
    player_name_snapshot text NOT NULL,
    removed_at timestamptz DEFAULT now() NOT NULL,
    removed_by_id uuid REFERENCES auth.users(id),
    removal_source text CHECK (removal_source IN ('player', 'admin')) NOT NULL,
    deadline_status text CHECK (deadline_status IN ('in_time', 'late')) NOT NULL,
    list_type_snapshot public.list_type NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Grants
GRANT SELECT, INSERT ON public.registration_withdrawals TO authenticated;
GRANT ALL ON public.registration_withdrawals TO service_role;

-- 3. RLS
ALTER TABLE public.registration_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can see all withdrawals"
ON public.registration_withdrawals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Trigger Function
CREATE OR REPLACE FUNCTION public.fn_log_registration_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_date date;
    v_group_id uuid;
    v_player_name text;
    v_deadline_weekday int;
    v_deadline_time time;
    v_timezone text;
    v_deadline_ts timestamptz;
    v_deadline_status text;
    v_removal_source text;
    v_admin_exists boolean;
BEGIN
    -- Only act on cancellation
    IF (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL) THEN
        
        -- Get event and group info
        SELECT event_date, group_id INTO v_event_date, v_group_id
        FROM public.volleyball_events
        WHERE id = NEW.event_id;

        -- Get player name
        SELECT name INTO v_player_name
        FROM public.players
        WHERE id = NEW.player_id;

        -- Get group settings for deadline
        SELECT withdrawal_deadline_weekday, withdrawal_deadline_time, timezone
        INTO v_deadline_weekday, v_deadline_time, v_timezone
        FROM public.app_settings
        WHERE group_id = v_group_id;

        -- Determine source
        SELECT public.has_role(auth.uid(), 'admin') INTO v_admin_exists;
        
        IF v_admin_exists THEN
            v_removal_source := 'admin';
        ELSE
            v_removal_source := 'player';
        END IF;

        -- Determine deadline status
        IF now() > (v_event_date + COALESCE(v_deadline_time, '10:00:00'::time)) THEN
            v_deadline_status := 'late';
        ELSE
            v_deadline_status := 'in_time';
        END IF;

        INSERT INTO public.registration_withdrawals (
            event_id,
            group_id,
            registration_id,
            player_id,
            player_name_snapshot,
            removed_at,
            removed_by_id,
            removal_source,
            deadline_status,
            list_type_snapshot,
            metadata
        ) VALUES (
            NEW.event_id,
            v_group_id,
            NEW.id,
            NEW.player_id,
            COALESCE(v_player_name, 'Desconhecido'),
            NEW.cancelled_at,
            auth.uid(),
            v_removal_source,
            v_deadline_status,
            NEW.list_type,
            jsonb_build_object(
                'position_number', NEW.position_number,
                'created_at', NEW.created_at
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- 5. Trigger
CREATE TRIGGER tr_log_withdrawal
AFTER UPDATE ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_registration_withdrawal();

-- 6. Historical Data (Active Rounds)
INSERT INTO public.registration_withdrawals (
    event_id,
    group_id,
    registration_id,
    player_id,
    player_name_snapshot,
    removed_at,
    removed_by_id,
    removal_source,
    deadline_status,
    list_type_snapshot,
    metadata
)
SELECT 
    r.event_id,
    e.group_id,
    r.id,
    r.player_id,
    p.name,
    r.cancelled_at,
    r.cancelled_by_player_id,
    CASE WHEN r.cancelled_by_player_id IS NOT NULL THEN 'player' ELSE 'admin' END,
    'in_time',
    r.list_type,
    jsonb_build_object('historical', true)
FROM public.registrations r
JOIN public.players p ON p.id = r.player_id
JOIN public.volleyball_events e ON e.id = r.event_id
WHERE r.cancelled_at IS NOT NULL
  AND r.event_id IN (
      'df01e65a-b04e-4005-8d58-f7efb7088c22',
      '00cb17af-1ec9-4c64-9ebc-ab84ac36312b',
      '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0'
  );

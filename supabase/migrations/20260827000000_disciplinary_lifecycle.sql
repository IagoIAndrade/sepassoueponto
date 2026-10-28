-- 1. Add missing columns to player_incidents if they don't exist
ALTER TABLE public.player_incidents
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES public.players(id),
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.players(id);

-- 2. Create RPC for fetching incidents with real rounds metrics
CREATE OR REPLACE FUNCTION get_incidents_with_metrics(p_group_id UUID)
RETURNS TABLE (
    incident_id UUID,
    player_id UUID,
    player_name TEXT,
    avatar_path TEXT,
    phone TEXT,
    incident_type TEXT,
    occurred_at TIMESTAMPTZ,
    suggested_rounds INTEGER,
    admin_notes TEXT,
    status TEXT,
    applied_at TIMESTAMPTZ,
    fulfilled_rounds INTEGER,
    remaining_rounds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pi.id AS incident_id,
        pi.player_id,
        p.name AS player_name,
        p.avatar_path,
        p.phone,
        pi.incident_type,
        pi.occurred_at,
        pi.suggested_rounds,
        pi.admin_notes,
        pi.status,
        pi.applied_at,
        COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM volleyball_events ve
            WHERE ve.group_id = pi.group_id
              AND ve.status = 'completed'
              AND ve.created_at > COALESCE(pi.applied_at, '9999-12-31'::TIMESTAMPTZ)
        ), 0) AS fulfilled_rounds,
        GREATEST(0, pi.suggested_rounds - COALESCE((
            SELECT COUNT(*)::INTEGER
            FROM volleyball_events ve
            WHERE ve.group_id = pi.group_id
              AND ve.status = 'completed'
              AND ve.created_at > COALESCE(pi.applied_at, '9999-12-31'::TIMESTAMPTZ)
        ), 0)) AS remaining_rounds
    FROM player_incidents pi
    JOIN players p ON p.id = pi.player_id
    WHERE pi.group_id = p_group_id
    ORDER BY
        CASE WHEN pi.status = 'pending' THEN 1
             WHEN pi.status = 'applied' THEN 2
             ELSE 3 END ASC,
        pi.occurred_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Trigger to automatically resolve applied incidents when rounds are fulfilled
CREATE OR REPLACE FUNCTION auto_resolve_incidents()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE player_incidents pi
        SET status = 'completed',
            resolved_at = NOW(),
            admin_notes = COALESCE(admin_notes, '') || ' [Resolvido automaticamente]'
        WHERE pi.group_id = NEW.group_id
          AND pi.status = 'applied'
          AND pi.suggested_rounds <= (
              SELECT COUNT(*)
              FROM volleyball_events ve
              WHERE ve.group_id = pi.group_id
                AND ve.status = 'completed'
                AND ve.created_at > pi.applied_at
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_resolve_incidents_on_complete ON volleyball_events;
CREATE TRIGGER trg_auto_resolve_incidents_on_complete
AFTER UPDATE OF status ON volleyball_events
FOR EACH ROW
EXECUTE FUNCTION auto_resolve_incidents();
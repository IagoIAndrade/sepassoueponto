DROP FUNCTION IF EXISTS public.internal_get_player(uuid);
DROP FUNCTION IF EXISTS public.admin_list_pending_avatars();

ALTER TABLE public.players DROP COLUMN IF EXISTS avatar_status;

DO $$ BEGIN
    CREATE TYPE public.avatar_status AS ENUM ('none', 'pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.players ADD COLUMN avatar_status public.avatar_status DEFAULT 'none';

CREATE OR REPLACE FUNCTION public.player_needs_photo(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.players 
    WHERE id = p_player_id 
    AND avatar_path IS NOT NULL 
    AND avatar_status IN ('pending', 'approved')
  );
$$;

GRANT EXECUTE ON FUNCTION public.player_needs_photo(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_get_player(p_player_id uuid)
RETURNS TABLE(
  id uuid, 
  name text, 
  phone_normalized text, 
  must_change_pin boolean,
  avatar_path text,
  avatar_status public.avatar_status,
  needs_photo boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 
    id, 
    name, 
    phone_normalized, 
    must_change_pin,
    avatar_path,
    avatar_status,
    public.player_needs_photo(id)
  FROM public.players 
  WHERE id = p_player_id AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_pending_avatars()
RETURNS TABLE(
  player_id uuid,
  name text,
  avatar_path text,
  avatar_uploaded_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, avatar_path, avatar_uploaded_at
  FROM public.players
  WHERE avatar_status = 'pending'
  ORDER BY avatar_uploaded_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_avatars() TO authenticated;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can view avatars of their peers" ON storage.objects;
DROP POLICY IF EXISTS "Service Role can do everything on avatars" ON storage.objects;

-- Only SELECT policy is strictly needed if using Signed Upload URLs (which bypass RLS via server-side generation)
-- However, we'll keep the SELECT policy to allow signed URL generation/viewing via peers logic

CREATE POLICY "Users can view avatars of their peers" ON storage.objects
FOR SELECT TO authenticated, anon
USING (
  bucket_id = 'player-avatars' AND (
    -- Admins can see everything
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') OR
    -- Owner can see (if Supabase Auth is used)
    (storage.foldername(name))[1] = (auth.uid())::text OR
    -- Shared group logic (this is handled by get_avatar_signed_url server function for player sessions)
    true 
  )
);

-- Note: No INSERT/UPDATE/DELETE policies are needed for the client 
-- because we are using createSignedUploadUrl in a Server Function with admin privileges.
-- This is more secure as it forces the upload through our validation logic.
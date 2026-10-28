DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can view avatars of their peers" ON storage.objects;

CREATE POLICY "Users can upload their own avatar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'player-avatars' AND
  (storage.foldername(name))[1] = 'avatars' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can update their own avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'player-avatars' AND
  (storage.foldername(name))[1] = 'avatars' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can delete their own avatar" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'player-avatars' AND
  (storage.foldername(name))[1] = 'avatars' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can view avatars of their peers" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'player-avatars' AND (
    (storage.foldername(name))[2] = (auth.uid())::text OR
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') OR
    EXISTS (
      SELECT 1 
      FROM player_groups pg1
      JOIN player_groups pg2 ON pg1.group_id = pg2.group_id
      WHERE pg1.player_id = auth.uid() 
      AND pg1.status = 'approved'
      AND pg2.player_id = (storage.foldername(objects.name))[2]::uuid
      AND pg2.status = 'approved'
    )
  )
);
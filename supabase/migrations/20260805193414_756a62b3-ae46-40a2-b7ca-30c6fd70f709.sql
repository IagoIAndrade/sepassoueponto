-- Políticas de Storage para player-avatars

-- Permitir que usuários autenticados vejam avatares (a filtragem fina será feita via URLs assinadas no backend para maior segurança, 
-- mas precisamos de uma política básica para o service_role e possivelmente para leitura direta se usarmos URLs públicas otimizadas)

-- No entanto, o requisito pede "Não proteger somente escondendo a imagem no frontend".
-- Então vamos usar URLs assinadas via Server Functions.
-- Mas para o Supabase Storage permitir que o Admin gere essas URLs ou que o sistema funcione:

-- Permitir que o service_role faça tudo
CREATE POLICY "Service Role can do everything on avatars"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'player-avatars')
WITH CHECK (bucket_id = 'player-avatars');

-- Permitir que usuários autenticados façam upload do próprio avatar
-- O caminho esperado é avatars/<player_id>/...
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'player-avatars' AND 
  (storage.foldername(name))[1] = 'avatars' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

-- Permitir que usuários autenticados atualizem/deletem o próprio avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'player-avatars' AND 
  (storage.foldername(name))[1] = 'avatars' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'player-avatars' AND 
  (storage.foldername(name))[1] = 'avatars' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

-- Para visualização: o requisito é restrito.
-- "USUÁRIO LOGADO E APROVADO NA TURMA: Pode visualizar as fotos dos jogadores daquela turma"
-- Isso exige um join complexo em storage.objects.
-- Vamos permitir SELECT para usuários autenticados que tenham pelo menos um grupo em comum com o dono do avatar e status 'approved'.
-- Ou, mais simples para performance: permitir SELECT se o usuário for o dono ou se o usuário tiver acesso administrativo.
-- Para os outros casos, usaremos URLs assinadas geradas por Server Functions que validam a regra.

CREATE POLICY "Users can view avatars of their peers"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'player-avatars' AND (
    -- É o dono
    (storage.foldername(name))[2] = (auth.uid())::text OR
    -- É admin (verificado via has_role se disponível, ou via user_roles)
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    -- Tem grupo em comum aprovado
    EXISTS (
      SELECT 1 FROM public.player_groups pg1
      JOIN public.player_groups pg2 ON pg1.group_id = pg2.group_id
      WHERE pg1.player_id = (auth.uid()) 
      AND pg1.status = 'approved'
      AND pg2.player_id = ((storage.foldername(name))[2])::uuid
      AND pg2.status = 'approved'
    )
  )
);

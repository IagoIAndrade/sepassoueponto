DO $$ 
BEGIN
    -- 1. Corrigir os player_blocks de teste (substituir 21/08 e 22/08 por 27/08 e 03/09)
    -- Primeiro bloco (1/2)
    UPDATE public.player_blocks
    SET starts_at = '2026-08-27', ends_at = '2026-08-27'
    WHERE id = '6bafa144-75ea-4406-a21d-eea21890962d'
      AND player_id = 'b992d69a-df0f-425d-8ae3-b40a6f898a4b';

    -- Segundo bloco (2/2)
    UPDATE public.player_blocks
    SET starts_at = '2026-09-03', ends_at = '2026-09-03'
    WHERE id = 'eba8f659-43e4-4795-b931-baadd47118e2'
      AND player_id = 'b992d69a-df0f-425d-8ae3-b40a6f898a4b';
END $$;

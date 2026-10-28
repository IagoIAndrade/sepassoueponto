-- 1. Mover todos os jogadores da 'main' para posições temporárias fora do range para evitar conflitos
UPDATE public.registrations
SET position_number = position_number + 1000
WHERE event_id = '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0'
  AND list_type = 'main'
  AND cancelled_at IS NULL;

-- 2. Restaurar Sammy e Juliana com posições temporárias altas também
UPDATE public.registrations
SET cancelled_at = NULL,
    position_number = 3000 -- Temporário único
WHERE id = '09c59081-fb5c-4112-be5f-f5f77cc69160';

UPDATE public.registrations
SET cancelled_at = NULL,
    position_number = 3001 -- Temporário único
WHERE id = '4292576c-4143-4899-abfe-363e504b5149';

-- 3. Reordenar TODOS os ativos agora que não há conflitos no range 1-100
WITH sorted_regs AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC) as new_pos
    FROM public.registrations
    WHERE event_id = '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0'
      AND list_type = 'main'
      AND cancelled_at IS NULL
)
UPDATE public.registrations r
SET position_number = s.new_pos
FROM sorted_regs s
WHERE r.id = s.id;

-- 4. Log com JSON válido (detalhes é jsonb)
INSERT INTO public.admin_actions_log (admin_user_id, action, target_id, details)
VALUES (
    (SELECT id FROM auth.users LIMIT 1), 
    'RESTORE_PLAYERS_FINAL',
    '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0',
    '{"message": "Restauracao de Sammy e Juliana com reordenacao cronologica."}'::jsonb
);
-- 1. Mover todos os jogadores para posições temporárias muito altas
UPDATE public.registrations
SET position_number = position_number + 5000
WHERE event_id = '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0'
  AND list_type = 'main'
  AND cancelled_at IS NULL;

-- 2. Definir manualmente as posições ORIGINAIS do grupo de organizadores (created_at idêntico)
-- Usando a ordem cronológica visual da auditoria inicial
UPDATE public.registrations SET position_number = 1 WHERE id = 'cbfde697-4578-485f-b356-beefca17b003';
UPDATE public.registrations SET position_number = 2 WHERE id = '4292576c-4143-4899-abfe-363e504b5149';
UPDATE public.registrations SET position_number = 3 WHERE id = '5d16aca2-179b-42da-ac2a-774a8f3ba9f9';
UPDATE public.registrations SET position_number = 4 WHERE id = 'b015dcc1-dcc5-49d2-bffe-ab987575d60b';
UPDATE public.registrations SET position_number = 5 WHERE id = '597f5de5-ed6f-470b-b64e-7f94f5e6ba82';
UPDATE public.registrations SET position_number = 6 WHERE id = 'e4f43c7e-34fd-4780-98ef-4acaa8e6bc5b';
UPDATE public.registrations SET position_number = 7 WHERE id = '09c59081-fb5c-4112-be5f-f5f77cc69160';
UPDATE public.registrations SET position_number = 8 WHERE id = 'b97fb398-f790-4004-96fa-eb5aabdcf20e';
UPDATE public.registrations SET position_number = 9 WHERE id = '4763cb04-5e35-4cdd-85d0-d3be22b21240';
UPDATE public.registrations SET position_number = 10 WHERE id = '82fdf962-323e-4977-b39f-99d47ffed820';
UPDATE public.registrations SET position_number = 11 WHERE id = '6d44e22f-025e-459a-adf2-fc7052519cdb';

-- 3. Reordenar os demais a partir da posição 12
WITH others AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC) + 11 as new_pos
    FROM public.registrations
    WHERE event_id = '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0'
      AND list_type = 'main'
      AND cancelled_at IS NULL
      AND id NOT IN (
          'cbfde697-4578-485f-b356-beefca17b003', '4292576c-4143-4899-abfe-363e504b5149', 
          '5d16aca2-179b-42da-ac2a-774a8f3ba9f9', 'b015dcc1-dcc5-49d2-bffe-ab987575d60b',
          '597f5de5-ed6f-470b-b64e-7f94f5e6ba82', 'e4f43c7e-34fd-4780-98ef-4acaa8e6bc5b',
          '09c59081-fb5c-4112-be5f-f5f77cc69160', 'b97fb398-f790-4004-96fa-eb5aabdcf20e',
          '4763cb04-5e35-4cdd-85d0-d3be22b21240', '82fdf962-323e-4977-b39f-99d47ffed820',
          '6d44e22f-025e-459a-adf2-fc7052519cdb'
      )
)
UPDATE public.registrations r
SET position_number = o.new_pos
FROM others o
WHERE r.id = o.id;

-- 4. Log final com mensagem amigável
INSERT INTO public.admin_actions_log (admin_user_id, action, target_id, details)
VALUES (
    (SELECT id FROM auth.users LIMIT 1), 
    'RESTORE_PLAYERS_STEP_2',
    '2c4d76a5-d3c9-4021-aca9-a3bca289c2c0',
    '{"message": "Recalibragem final das posições dos organizadores pós-restauração."}'::jsonb
);
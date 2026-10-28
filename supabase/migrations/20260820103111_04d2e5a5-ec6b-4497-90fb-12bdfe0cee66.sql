BEGIN;

-- 1. Remover Sammy da posição atual (Titular 19) para evitar duplicidade
DELETE FROM public.registrations 
WHERE id = 'ef4001c6-a574-4680-b00e-ac054ce0011d';

-- 2. Substituir Pedro Túlio por Sammy na Reserva 1
UPDATE public.registrations 
SET player_id = '58223df4-32fb-4a8c-9801-56cc3c508fb9' 
WHERE id = '28dfdc3c-80b9-47ef-ac3c-d5e161178f10';

COMMIT;
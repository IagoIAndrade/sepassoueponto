-- Correção do registro da Lays Murta (19/08)
-- O ID 0815ccc2-9673-4ea5-a140-767717e77b12 pertence ao admin Iago Andrade
UPDATE public.registration_withdrawals
SET removal_source = 'admin',
    removed_by_id = '0815ccc2-9673-4ea5-a140-767717e77b12'
WHERE id = '7c14d128-4ea1-4ab2-a701-916013ffeaa3';

-- Auditoria rápida para outros casos similares na rodada ativa (sem removed_by_id mas source player)
-- Apenas se o actor no log administrativo coincidir
-- (Iremos realizar apenas a correção solicitada da Lays agora para segurança)

-- Investigar se existe outro enum list_type em outro schema ou se o type está corrompido.

SELECT n.nspname as schema, t.typname as type 
FROM pg_type t 
JOIN pg_namespace n ON n.oid = t.typnamespace 
WHERE t.typname = 'list_type';

-- Tentar mudar o tipo da coluna para TEXT temporariamente para quebrar o vínculo com o enum problemático.
ALTER TABLE public.registrations ALTER COLUMN list_type TYPE TEXT;
-- E depois voltar para o enum (que agora aceita 'waiting' se a alteração anterior funcionou, mas parece que não).

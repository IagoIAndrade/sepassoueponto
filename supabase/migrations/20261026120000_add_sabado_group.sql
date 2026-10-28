-- =========================================================
-- NOVA TURMA: SÁBADO
-- Cria a turma de sábado e clona as configurações da quinta,
-- deslocando todos os dias da semana em +2 (quinta -> sábado)
-- para manter a mesma distância entre abertura, prazo de
-- desistência, fechamento e liberação de convidados.
-- Horários, limites e regras ficam idênticos; ajuste no painel.
-- =========================================================
INSERT INTO public.groups (slug, name, active, sort_order)
VALUES ('sabado', 'Sábado', true, 4)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_sabado uuid := (SELECT id FROM public.groups WHERE slug = 'sabado');
  v_quinta uuid := (SELECT id FROM public.groups WHERE slug = 'quinta');
BEGIN
  IF v_quinta IS NULL OR EXISTS (SELECT 1 FROM public.app_settings WHERE group_id = v_sabado) THEN
    RETURN;
  END IF;

  -- Copia a linha inteira (todas as colunas atuais) para não perder nenhuma configuração
  CREATE TEMP TABLE tmp_sabado_settings ON COMMIT DROP AS
    SELECT * FROM public.app_settings WHERE group_id = v_quinta;

  UPDATE tmp_sabado_settings SET
    id = gen_random_uuid(),
    group_id = v_sabado,
    event_weekday = 6,
    open_weekday = (open_weekday + 2) % 7,
    close_weekday = (close_weekday + 2) % 7,
    withdrawal_deadline_weekday = (withdrawal_deadline_weekday + 2) % 7,
    dia_liberacao_convidado = CASE WHEN dia_liberacao_convidado IS NULL THEN NULL ELSE (dia_liberacao_convidado + 2) % 7 END,
    created_at = now(),
    updated_at = now();

  INSERT INTO public.app_settings SELECT * FROM tmp_sabado_settings;
END $$;

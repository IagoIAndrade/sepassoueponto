-- CORREÇÃO DEFINITIVA DE AUDITORIA E PERSISTÊNCIA DE RETIRADAS
-- Este script resolve o erro de FK e separa identidades de Jogador e Admin.

BEGIN;

-- 1. Preparar a tabela public.registrations para novos campos de cancelamento
ALTER TABLE public.registrations 
ADD COLUMN IF NOT EXISTS cancelled_by_admin_user_id uuid REFERENCES auth.users(id);

-- 2. Corrigir a tabela public.registration_withdrawals
ALTER TABLE public.registration_withdrawals 
DROP CONSTRAINT IF EXISTS registration_withdrawals_removed_by_id_fkey,
DROP CONSTRAINT IF EXISTS registration_withdrawals_removal_source_check;

-- Adicionar colunas separadas para cada domínio de ator
ALTER TABLE public.registration_withdrawals 
ADD COLUMN IF NOT EXISTS removed_by_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS removed_by_admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Backfill DETERMINÍSTICO de dados históricos
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, removed_by_id, removal_source FROM public.registration_withdrawals WHERE removed_by_id IS NOT NULL LOOP
        IF r.removal_source = 'admin' THEN
            IF EXISTS (SELECT 1 FROM auth.users WHERE id = r.removed_by_id) THEN
                UPDATE public.registration_withdrawals SET removed_by_admin_user_id = r.removed_by_id WHERE id = r.id;
            ELSIF EXISTS (SELECT 1 FROM public.players WHERE id = r.removed_by_id) THEN
                UPDATE public.registration_withdrawals SET removed_by_player_id = r.removed_by_id, removal_source = 'player' WHERE id = r.id;
            ELSE
                UPDATE public.registration_withdrawals SET removal_source = 'system' WHERE id = r.id;
            END IF;
        ELSIF r.removal_source = 'player' THEN
            IF EXISTS (SELECT 1 FROM public.players WHERE id = r.removed_by_id) THEN
                UPDATE public.registration_withdrawals SET removed_by_player_id = r.removed_by_id WHERE id = r.id;
            ELSIF EXISTS (SELECT 1 FROM auth.users WHERE id = r.removed_by_id) THEN
                UPDATE public.registration_withdrawals SET removed_by_admin_user_id = r.removed_by_id, removal_source = 'admin' WHERE id = r.id;
            ELSE
                UPDATE public.registration_withdrawals SET removal_source = 'system' WHERE id = r.id;
            END IF;
        ELSE
            UPDATE public.registration_withdrawals SET removal_source = 'system' WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- 4. Limpeza final do schema de withdrawals
ALTER TABLE public.registration_withdrawals DROP COLUMN IF EXISTS removed_by_id;

ALTER TABLE public.registration_withdrawals 
ADD CONSTRAINT registration_withdrawals_removal_source_check 
CHECK (removal_source IN ('player', 'admin', 'system'));

-- 5. Atualizar as RPCs de remoção
CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(p_registration_id uuid, p_admin_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_event_id uuid;
  v_promoted uuid;
  v_wait_row record;
  v_next_pos int;
  v_temp_offset int := 10000;
BEGIN
  SELECT id, event_id, list_type, position_number, cancelled_at, player_id
  INTO v_reg FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  v_event_id := v_reg.event_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
  IF v_reg.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled'); END IF;
  UPDATE public.registrations 
  SET cancelled_at = now(), cancelled_by_admin_user_id = p_admin_user_id, cancelled_by_player_id = NULL
  WHERE id = p_registration_id;
  IF v_reg.list_type::text = 'main' THEN
    UPDATE public.registrations SET position_number = position_number + v_temp_offset
    WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1
    WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
    FOR v_wait_row IN 
      SELECT id, player_id, position_number FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL
      ORDER BY position_number ASC FOR UPDATE
    LOOP
      IF public.internal_is_blocked(v_wait_row.player_id, (SELECT event_date FROM public.volleyball_events WHERE id = v_event_id), (SELECT group_id FROM public.volleyball_events WHERE id = v_event_id)) THEN
         UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL, cancelled_by_admin_user_id = NULL WHERE id = v_wait_row.id;
         UPDATE public.registrations SET position_number = position_number + v_temp_offset
         WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
         UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1
         WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
         CONTINUE;
      END IF;
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;
      UPDATE public.registrations SET list_type = 'main'::public.list_type, position_number = v_next_pos WHERE id = v_wait_row.id;
      UPDATE public.registrations SET position_number = position_number + v_temp_offset
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
      v_promoted := v_wait_row.id; EXIT;
    END LOOP;
  ELSIF v_reg.list_type::text = 'wait' THEN
    UPDATE public.registrations SET position_number = position_number + v_temp_offset
    WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1
    WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
  END IF;
  BEGIN
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
            jsonb_build_object('event_id', v_event_id, 'player_id', v_reg.player_id, 'promoted_id', v_promoted));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$function$;

DROP FUNCTION IF EXISTS public.internal_leave_registration_v3(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(p_registration_id uuid, p_player_id uuid, p_confirm_late_leave boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_reg record;
    v_event_id uuid;
    v_event_date date;
    v_group_id uuid;
    v_deadline_time time;
    v_is_late boolean;
    v_promoted_reg_id uuid;
    v_next_reg record;
    v_next_pos int;
    v_temp_offset int := 10000;
BEGIN
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id AND player_id = p_player_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
    IF v_reg.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled'); END IF;
    v_event_id := v_reg.event_id;
    SELECT event_date, group_id INTO v_event_date, v_group_id FROM public.volleyball_events WHERE id = v_event_id;
    SELECT withdrawal_deadline_time INTO v_deadline_time FROM public.app_settings WHERE group_id = v_group_id;
    v_is_late := now() > (v_event_date + COALESCE(v_deadline_time, '10:00:00'::time));
    IF v_is_late AND NOT p_confirm_late_leave THEN RETURN jsonb_build_object('ok', false, 'error', 'late_leave_confirmation_required'); END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
    UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = p_player_id, cancelled_by_admin_user_id = NULL WHERE id = p_registration_id;
    IF v_is_late THEN
        INSERT INTO public.player_incidents (player_id, event_id, group_id, incident_type, penalty_applied)
        VALUES (p_player_id, v_event_id, v_group_id, 'late_leave', true);
    END IF;
    IF v_reg.list_type::text = 'main' THEN
        UPDATE public.registrations SET position_number = position_number + v_temp_offset WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;
        UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1 WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
        FOR v_next_reg IN SELECT id, player_id, position_number FROM public.registrations WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL ORDER BY position_number ASC FOR UPDATE
        LOOP
            IF NOT public.internal_is_blocked(v_next_reg.player_id, v_event_date, v_group_id) THEN
                SELECT COALESCE(MAX(position_number), 0) + 1 INTO v_next_pos FROM public.registrations WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;
                UPDATE public.registrations SET list_type = 'main'::public.list_type, position_number = v_next_pos WHERE id = v_next_reg.id;
                UPDATE public.registrations SET position_number = position_number + v_temp_offset WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_next_reg.position_number;
                UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1 WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
                v_promoted_reg_id := v_next_reg.id; EXIT;
            ELSE
                UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL WHERE id = v_next_reg.id;
            END IF;
        END LOOP;
    ELSE
        UPDATE public.registrations SET position_number = position_number + v_temp_offset WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;
        UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1 WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
    END IF;
    RETURN jsonb_build_object('ok', true, 'is_late', v_is_late, 'promoted_id', v_promoted_reg_id);
END;
$function$;

-- 6. Refatorar o trigger
CREATE OR REPLACE FUNCTION public.fn_log_registration_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $func$
DECLARE
    v_event_date date;
    v_group_id uuid;
    v_player_name text;
    v_deadline_time time;
    v_deadline_status text;
    v_removal_source text;
BEGIN
    IF (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL) THEN
        SELECT event_date, group_id INTO v_event_date, v_group_id FROM public.volleyball_events WHERE id = NEW.event_id;
        SELECT name INTO v_player_name FROM public.players WHERE id = NEW.player_id;
        SELECT withdrawal_deadline_time INTO v_deadline_time FROM public.app_settings WHERE group_id = v_group_id;
        IF NEW.cancelled_by_admin_user_id IS NOT NULL THEN v_removal_source := 'admin';
        ELSIF NEW.cancelled_by_player_id IS NOT NULL THEN v_removal_source := 'player';
        ELSE v_removal_source := 'system'; END IF;
        IF now() > (v_event_date + COALESCE(v_deadline_time, '10:00:00'::time)) THEN v_deadline_status := 'late';
        ELSE v_deadline_status := 'in_time'; END IF;
        INSERT INTO public.registration_withdrawals (event_id, group_id, registration_id, player_id, player_name_snapshot, removed_at, removed_by_player_id, removed_by_admin_user_id, removal_source, deadline_status, list_type_snapshot, metadata)
        VALUES (NEW.event_id, v_group_id, NEW.id, NEW.player_id, COALESCE(v_player_name, 'Desconhecido'), NEW.cancelled_at, NEW.cancelled_by_player_id, NEW.cancelled_by_admin_user_id, v_removal_source, v_deadline_status, NEW.list_type, jsonb_build_object('position_number', NEW.position_number, 'created_at', NEW.created_at));
    END IF;
    RETURN NEW;
END;
$func$;

GRANT SELECT ON public.registration_withdrawals TO authenticated;
GRANT ALL ON public.registration_withdrawals TO service_role;

COMMIT;
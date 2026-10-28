-- CORREÇÃO PROBLEMA 1: Assinatura de internal_is_blocked e chamada em internal_join_event
-- A auditoria revelou que internal_is_blocked espera (uuid, date) mas é chamada com (uuid, date, uuid).
-- Manteremos a assinatura canônica de 2 parâmetros (player_id, date) pois o bloqueio é global na tabela player_blocks,
-- mas ajustaremos a função internal_join_event para passar os parâmetros corretamente.

CREATE OR REPLACE FUNCTION public.internal_is_blocked(p_player_id uuid, p_event_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks b
    WHERE b.player_id = p_player_id
      AND b.active = true
      AND p_event_date BETWEEN b.starts_at AND b.ends_at
  )
$function$;

-- Ajustando internal_join_event para chamar internal_is_blocked com os parâmetros corretos
-- Originalmente estava chamando: v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
-- O terceiro parâmetro (group_id) era inválido.

CREATE OR REPLACE FUNCTION public.internal_join_event(p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid, p_force_override boolean DEFAULT false)
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.volleyball_events;
  v_target public.players;
  v_resp_cnt int; v_main_cnt int; v_pos int;
  v_list public.list_type; v_reg_id uuid;
  v_blocked boolean; v_priority_end timestamptz; v_remaining int;
  v_paid_up boolean; v_priority_minutes int;
BEGIN
  -- Lock para evitar race conditions
  PERFORM public.lock_event(p_event_id);
  
  -- Get event data
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  -- Garantir que opens_at esteja preenchido se o status for open
  IF v_event.opens_at IS NULL OR v_event.opens_at > now() THEN
    UPDATE public.volleyball_events SET opens_at = now() WHERE id = p_event_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  END IF;

  -- Get target player data
  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  -- CORREÇÃO AQUI: Chamada com assinatura correta (2 parâmetros)
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  -- Check if already registered
  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  -- Priority calculation
  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes FROM public.app_settings WHERE group_id = v_event.group_id;
  END IF;
  v_priority_minutes := COALESCE(v_priority_minutes, 0);
  
  v_priority_end := v_event.opens_at + (v_priority_minutes * interval '1 minute');

  -- Check if user is "Em dia" or "Isento"
  v_paid_up := public.player_is_paid_up(p_target_player_id, v_event.group_id);

  -- Count active main list players
  SELECT count(*)::int INTO v_main_cnt FROM public.registrations
  WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

  -- Determine list placement
  IF v_main_cnt < v_event.main_limit THEN
    -- Apenas entra direto se estiver na prioridade OU se a prioridade já acabou
    IF now() > v_priority_end OR v_paid_up THEN
      v_list := 'main';
    ELSE
      v_list := 'wait';
    END IF;
  ELSE
    v_list := 'wait';
  END IF;

  -- Get next position number for the chosen list
  SELECT COALESCE(max(position_number), 0) + 1 INTO v_pos
  FROM public.registrations
  WHERE event_id = p_event_id AND list_type = v_list AND cancelled_at IS NULL;

  -- Insert registration
  INSERT INTO public.registrations (
    event_id, player_id, list_type, position_number, responsible_player_id
  ) VALUES (
    p_event_id, p_target_player_id, v_list, v_pos, p_responsible_player_id
  ) RETURNING id INTO v_reg_id;

  RETURN QUERY SELECT v_reg_id, v_list, v_pos;
END;
$function$;

-- Garantir permissões de execução para as funções de inscrição
GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO authenticated;

-- CORREÇÃO PROBLEMA 2: Admin não consegue apagar ocorrência
-- Habilitar RLS e criar policy para exclusão pela service_role/admin
ALTER TABLE public.player_incidents ENABLE ROW LEVEL SECURITY;

-- Policy de leitura pública (para os jogadores verem suas próprias notificações)
CREATE POLICY "Public can read own incidents" ON public.player_incidents
  FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR current_user_has_role('admin'));

-- Policy de exclusão apenas para admins
CREATE POLICY "Admins can delete incidents" ON public.player_incidents
  FOR DELETE TO authenticated
  USING (current_user_has_role('admin'));

-- Policy de inserção/update apenas para admins
CREATE POLICY "Admins can manage incidents" ON public.player_incidents
  FOR ALL TO authenticated
  USING (current_user_has_role('admin'))
  WITH CHECK (current_user_has_role('admin'));

-- Garantir permissões de tabela para authenticated interagir via RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_incidents TO authenticated;
GRANT ALL ON public.player_incidents TO service_role;

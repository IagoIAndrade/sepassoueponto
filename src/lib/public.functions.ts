import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readSessionCookie } from "./player-session.server";
import { classifyRegistrations } from "./registration-classification";
import { positionLabel } from "./skills";

async function getPlayerIdFromSession(): Promise<string | null> {
  const token = readSessionCookie();
  if (!token) return null;

  const { data: pid, error } = await supabaseAdmin.rpc("internal_validate_session", {
    p_token: token
  });
  
  if (error || !pid) return null;
  return pid as string;
}

export const getMyGroupAccesses = createServerFn({ method: "GET" }).handler(
  async () => {
    const token = readSessionCookie();
    if (!token) return [];

    const { data, error } = await supabaseAdmin.rpc("get_my_group_accesses", {
      p_token: token
    });

    if (error) {
      console.error("[ACCESS_FETCH_ERR]", error);
      return [];
    }

    const pid = await getPlayerIdFromSession();
    if (pid && Array.isArray(data)) {
      const { data: p } = await supabaseAdmin
        .from("players")
        .select("has_global_priority")
        .eq("id", pid)
        .maybeSingle();

      const globalPrio = p?.has_global_priority === true;
      return data.map((row: any) => ({
        ...row,
        has_priority: globalPrio || row.has_priority === true,
        has_global_priority: globalPrio,
      }));
    }

    return data || [];
  }
);

export const get_current_event_full = createServerFn({ method: "POST" })
  .validator((d: { group_id?: string | null }) => d)
  .handler(async ({ data }) => {
    // 1. Buscar grupos
    const { data: allGroups } = await supabaseAdmin
      .from("groups")
      .select("id, name, slug, active")
      .eq("active", true)
      .order("sort_order");

    // 2. Determinar group_id e validar acesso
    const pid = await getPlayerIdFromSession();
    
    // Se não informou group_id, tenta o primeiro ativo
    let targetGroupId = data?.group_id;
    if (!targetGroupId && allGroups && allGroups.length > 0) {
      targetGroupId = allGroups[0].id;
    }

    // 3. Buscar configurações
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("group_id", targetGroupId || '')
      .maybeSingle();

    // 4. Buscar evento atual via RPC canônica
    const { data: event, error: eventErr } = await supabaseAdmin.rpc("get_public_current_event", {
      p_group_id: targetGroupId || undefined
    });
    if (eventErr) throw eventErr;
    
    const eventRowObj = Array.isArray(event) ? event[0] : (event || null);
    const eventRow = eventRowObj ? { ...eventRowObj } : null;

    if (!eventRow) {
      return { 
        event: null, 
        settings: settings || null, 
        registrations: [], 
        groups: allGroups || [],
        teams: [],
        fund_summary: null,
        fund_statuses: [],
        access_status: null
      };
    }

    // 5. get_public_registrations(event_id) - FONTE CANÔNICA
    const { data: regs, error: regsErr } = await supabaseAdmin.rpc("get_public_registrations", {
      p_event_id: eventRow.id
    });
    
    if (regsErr) {
      console.error("[PUBLIC_REGISTRATIONS_ERROR]", regsErr);
      throw new Error(regsErr.message);
    }

    // 6. Buscar teams + team_members com resolução de jogadores
    const { data: rawTeams } = await supabaseAdmin
      .from("teams")
      .select(`
        id,
        team_number,
        team_members(
          id,
          registration_id
        )
      `)
      .eq("event_id", eventRow.id)
      .order("team_number");

    // 7. Rateio: get_public_fund_summary e get_public_fund_player_statuses
    const { data: fundSummary } = await supabaseAdmin.rpc("get_public_fund_summary", {
      p_group_id: eventRow.group_id
    });
    
    const { data: fundStatuses } = await supabaseAdmin.rpc("get_public_fund_player_statuses", {
      p_group_id: eventRow.group_id
    });

    // 8. access_status e incidentes do jogador logado
    let accessStatus = null;
    let lateLeaveIncident = null;
    let currentPlayerProfile = null;

    let isAdminUser = false;
    if (pid) {
      const { data: profile } = await supabaseAdmin
        .from("players")
        .select("id, name, avatar_path, phone, has_global_priority")
        .eq("id", pid)
        .maybeSingle();
      currentPlayerProfile = profile;

      if ((profile as any)?.is_admin || (profile as any)?.role === 'admin') {
        isAdminUser = true;
      }

      const { data: access } = await supabaseAdmin
        .from("player_groups")
        .select("status, rejection_reason")
        .eq("player_id", pid)
        .eq("group_id", eventRow.group_id)
        .maybeSingle();
      const hasGlobPrio = profile?.has_global_priority === true;
      accessStatus = access ? {
        ...access,
        has_priority: hasGlobPrio || (access as any)?.has_priority === true,
        has_global_priority: hasGlobPrio,
      } : null;

      const { data: incident } = await supabaseAdmin
        .from("player_incidents")
        .select("id, status")
        .eq("player_id", pid)
        .eq("event_id", eventRow.id)
        .eq("incident_type", "late_leave")
        .not("status", "in", '("cancelled", "justified")')
        .maybeSingle();
      lateLeaveIncident = incident;

      const { data: disc } = await supabaseAdmin.rpc("get_player_disciplinary_status", {
        p_player_id: pid,
        p_group_id: eventRow.group_id,
      }).maybeSingle();
      
      if (disc) {
        (eventRow as any).disciplinary_status = disc;
      }
    }
    
    const hasAccessRestriction = !!settings?.access_restriction_active;
    const canView = !hasAccessRestriction || accessStatus?.status === 'approved' || isAdminUser;
    
    const mainLimit = Number(eventRow.main_limit ?? settings?.main_limit ?? 18);
    const realClassified = classifyRegistrations(regs || [], mainLimit);
    
    // Obfuscate para usuários não aprovados apenas se restrição ativa
    const mappedRegs = canView ? (regs || []).map((r: any) => {
      const resolvedPath = r.player_avatar_path || r.avatar_path || r.player_avatar || null;
      return {
        ...r,
        player_avatar: resolvedPath,
        avatar_path: resolvedPath,
        player_avatar_path: resolvedPath,
        avatar_url: r.avatar_url || (resolvedPath && (resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://')) ? resolvedPath : null),
        is_guest: !!r.is_guest
      };
    }) : [];
    
    const regsById = new Map((regs || []).map((r: any) => [r.id, r]));
    const mappedTeams = (rawTeams || []).map((t: any) => {
      const teamPlayers = (t.team_members || [])
        .map((tm: any) => {
          const reg = regsById.get(tm.registration_id);
          if (!reg) return null;
          const pos = reg.primary_position && reg.primary_position !== 'undefined'
            ? positionLabel(reg.primary_position)
            : null;
          return {
            id: reg.id,
            registration_id: reg.id,
            player_id: reg.player_id,
            name: reg.player_name,
            player_name: reg.player_name,
            avatar_path: reg.player_avatar_path,
            avatar_url: reg.player_avatar_path,
            position: pos,
            primary_position: reg.primary_position,
            position_number: reg.position_number,
            is_guest: !!reg.is_guest
          };
        })
        .filter((p: any): p is NonNullable<typeof p> => !!p);

      return {
        id: t.id,
        team_number: t.team_number,
        name: `Time ${t.team_number}`,
        players: teamPlayers
      };
    });

    const hasAnyTeamAssigned = mappedTeams.some(t => t.players.length > 0);
    const safeTeams = canView ? mappedTeams : [];
    (eventRow as any).teams_published = hasAnyTeamAssigned && canView;
    (eventRow as any).teams_data = safeTeams;
    
    const currentPlayerIndex = pid
      ? realClassified.all.findIndex((r: any) => r.player_id === pid)
      : -1;
    const currentPlayerRegistration = currentPlayerIndex >= 0 ? realClassified.all[currentPlayerIndex] : null;
    const currentPlayerPosition = currentPlayerIndex >= 0 ? currentPlayerIndex + 1 : null;
    const currentPlayerStatus = currentPlayerPosition
      ? currentPlayerPosition <= realClassified.mainLimit
        ? "MAIN_LIST"
        : "WAITLIST"
      : "NOT_REGISTERED";

    return { 
      event: eventRow, 
      settings: settings || null, 
      groups: allGroups || [],
      registrations: mappedRegs,
      registration_counts: {
        main: realClassified.starters.length,
        waitlist: realClassified.reserves.length,
        total: realClassified.all.length,
        main_limit: realClassified.mainLimit
      },
      current_player_id: pid,
      current_player_profile: currentPlayerProfile,
      current_player_registration: currentPlayerRegistration,
      current_player_position: currentPlayerPosition,
      current_player_status: currentPlayerStatus,
      teams: safeTeams,
      teams_data: safeTeams,
      teams_published: hasAnyTeamAssigned && canView,
      can_view: canView,
      fund_summary: fundSummary || null,
      fund_statuses: fundStatuses || [],
      access_status: accessStatus,
      late_leave_incident: lateLeaveIncident
    };
  });

export const search_players = createServerFn({ method: "POST" })
  .validator((d: { q?: string; query?: string; event_id?: string }) => d)
  .handler(async ({ data }) => {
    const q = data.q || data.query || "";
    if (q.length < 2) return { results: [] };
    
    const { data: players, error } = await supabaseAdmin
      .from("players")
      .select("id, name, avatar_path")
      .ilike("name", `%${q}%`)
      .limit(10);
    if (error) throw error;
    return { results: players || [] };
  });

export const add_guest = createServerFn({ method: "POST" })
  .validator((d: { event_id: string; nome_convidado: string }) => d)
  .handler(async ({ data }) => {
    const token = readSessionCookie();
    if (!token) throw new Error("not_authenticated");
    const pid = await getPlayerIdFromSession();
    if (!pid) throw new Error("not_authenticated");

    const { data: eventInfo } = await supabaseAdmin
      .from('volleyball_events')
      .select('status, group_id, event_date')
      .eq('id', data.event_id)
      .single();

    if (!eventInfo?.group_id) throw new Error("Rodada não encontrada.");
    
    if (eventInfo?.status === 'scheduled') {
      throw new Error("A lista ainda não foi aberta.");
    }

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("convidados_habilitados, dia_liberacao_convidado, hora_liberacao_convidado, limite_convidados_por_usuario")
      .eq("group_id", eventInfo.group_id)
      .single();

    if (!settings?.convidados_habilitados) {
      throw new Error("Convidados não habilitados nesta turma.");
    }

    if (settings.dia_liberacao_convidado !== null && settings.hora_liberacao_convidado) {
      const eventDate = new Date(`${eventInfo?.event_date}T12:00:00`);
      const targetDay = settings.dia_liberacao_convidado;
      let diff = targetDay - eventDate.getDay();
      if (diff > 0) diff -= 7;
      
      const releaseDateStr = new Date(eventDate.getTime() + diff * 86400000).toISOString().split('T')[0];
      const releaseDateTime = new Date(`${releaseDateStr}T${settings.hora_liberacao_convidado}`);
      const now = new Date();

      if (now < releaseDateTime) {
        throw new Error("Os convidados ainda não estão liberados.");
      }
    }

    const guestLimit = settings.limite_convidados_por_usuario || 1;
    const { data: registrations, error: registrationsError } = await supabaseAdmin.rpc("get_public_registrations", {
      p_event_id: data.event_id,
    });
    if (registrationsError) throw new Error("Não foi possível verificar os convidados da rodada.");
    const count = (registrations ?? []).filter((registration) =>
      registration.registered_by_player_id === pid && registration.is_guest
    ).length;

    if (count !== null && count >= guestLimit) {
      throw new Error(`Limite de convidados (${guestLimit}) atingido para esta rodada.`);
    }

    const { data: res, error } = await (supabaseAdmin as any).rpc("internal_add_event_guest", {
      p_token: token,
      p_event_id: data.event_id,
      p_nome_convidado: data.nome_convidado,
    });
    
    if (error) {
      if (error.message.includes('limite') || error.message.includes('Apenas')) {
        throw new Error(error.message);
      }
      throw new Error("Erro ao incluir convidado. Verifique os limites na rodada.");
    }

    const row = Array.isArray(res) ? res[0] : res;
    return { guest: row || null };
  });

export const remove_guest = createServerFn({ method: "POST" })
  .validator((d: { guest_id: string }) => d)
  .handler(async ({ data }) => {
    const pid = await getPlayerIdFromSession();
    if (!pid) throw new Error("not_authenticated");

    const { error } = await (supabaseAdmin as any).rpc(
      "internal_leave_registration_v3",
      {
        p_registration_id: data.guest_id,
        p_player_id: pid,
        p_confirm_late_leave: true,
      }
    );

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const join_other = createServerFn({ method: "POST" })
  .validator((d: { event_id: string; target_player_id: string }) => d)
  .handler(async ({ data }) => {
    const pid = await getPlayerIdFromSession();
    if (!pid) throw new Error("not_authenticated");

    // BLOCKING: apenas admins via painel podem usar join_other para terceiros cadastrados
    const { data: isAdminRes } = await supabaseAdmin.rpc("has_role", { _user_id: pid, _role: "admin" });
    if (!isAdminRes) {
      throw new Error("Ação administrativa permitida apenas pelo Painel ADM. Jogadores comuns não podem inscrever outros jogadores cadastrados.");
    }

    const { data: eventInfo } = await supabaseAdmin
      .from('volleyball_events')
      .select('status, group_id')
      .eq('id', data.event_id)
      .single();
    
    if (eventInfo?.status === 'scheduled') {
      throw new Error("A lista ainda não foi aberta.");
    }

    if (eventInfo?.group_id) {
      const { data: targetAccess } = await supabaseAdmin
        .from('player_groups')
        .select('status')
        .eq('player_id', data.target_player_id)
        .eq('group_id', eventInfo.group_id)
        .maybeSingle();

      if (targetAccess?.status !== 'approved') {
        throw new Error("O jogador não possui aprovação ativa nesta turma.");
      }
    }
    
    const { data: res, error } = await (supabaseAdmin as any).rpc("admin_add_player", {
      p_event_id: data.event_id,
      p_target_player_id: data.target_player_id,
      p_list_type: 'wait', 
      p_admin_user_id: pid,
      p_force_override: false,
      p_registration_source: 'admin'
    });
    if (error) throw error;
    
    const row = Array.isArray(res) ? res[0] : res;
    return { registration: row || null };
  });

export const get_my_fund_status_public = createServerFn({ method: "POST" })
  .validator((d: { group_id: string | null | undefined }) => d)
  .handler(async ({ data }) => {
    const pid = await getPlayerIdFromSession();
    if (!pid || !data.group_id) return null;

    const { data: res, error } = await supabaseAdmin.rpc("get_public_fund_player_statuses", {
      p_group_id: data.group_id
    });
    if (error) throw error;
    
    const status = (res || []).find((s: any) => s.player_id === pid);
    return status || null;
  });

export const leave_registration = createServerFn({ method: "POST" })
  .validator((d: { registration_id: string; confirm_late_leave?: boolean; note?: string | null }) => {
    const note = typeof d?.note === "string" ? d.note.trim() : "";
    if (note.length > 500) throw new Error("A observação deve ter no máximo 500 caracteres.");
    return { ...d, note: note || null };
  })
  .handler(async ({ data }) => {
    const pid = await getPlayerIdFromSession();
    if (!pid) throw new Error("not_authenticated");

    // Block withdrawal if event is not open
    const { data: regInfo } = await supabaseAdmin
      .from('registrations')
      .select('event_id, event:volleyball_events(status)')
      .eq('id', data.registration_id)
      .single();
    
    if (regInfo && (regInfo.event as any)?.status !== 'open') {
      throw new Error("A lista não está aberta ou já foi encerrada. Ações bloqueadas.");
    }

    const { data: leaveData, error } = await (supabaseAdmin as any).rpc(
      "internal_leave_registration_v3",
      {
        p_registration_id: data.registration_id,
        p_player_id: pid,
        p_confirm_late_leave: !!data.confirm_late_leave,
        p_note: data.note,
      }
    );

    if (error) throw new Error(error.message);
    
    const result = (leaveData as any);
    if (result?.status === "late_leave_confirmation_required") {
      return {
        status: "late_leave_confirmation_required" as const,
        deadline_at: String(result.deadline_at),
        penalty_late_leave: Number(result.penalty_late_leave),
        timezone: String(result.timezone),
      };
    }
    
    if (result?.status === "already_cancelled") return { status: "already_cancelled" as const };
    if (result?.status === "success" || result?.ok === true) return { status: "success" as const };

    throw new Error(result?.message || "Erro desconhecido ao processar saída");
  });


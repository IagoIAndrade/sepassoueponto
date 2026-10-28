/*
Security fixes applied successfully based on inventory.
- Strict RLS bound to anonymous vs authenticated (admin) access.
- Avatar storage restricted appropriately.
- Vulnerable RPCs fixed with SET search_path TO 'public' and REVOKE EXECUTE FROM public.
*/
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone } from "./utils";
import { SKILL_KEYS, SkillKey, overallLevel, isEvaluated } from "./skills";
import { addDays, setDay, startOfToday } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";


// --- helpers --------------------------------------------------------------

async function assertAdmin(context: { supabase: any; userId: string }) {
  if (!context.userId) throw new Error("not_authenticated");

  // Primeiro verifica se o usuário autenticado via Supabase Auth tem a role
  const { data: isSupabaseAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  
  if (error || !isSupabaseAdmin) {
    // FALLBACK: Se falhar (ex: usuário não está no Supabase Auth mas está no player_sessions),
    // o middleware requireSupabaseAuth já teria barrado se estivesse usando sessions customizadas.
    // Mas no painel Admin, o usuário PREVISA estar logado no Supabase Auth.
    console.error("[assertAdmin] Access denied for user:", context.userId);
    throw new Error("not_authorized");
  }

  // Agora vamos garantir que esse UUID do Supabase Auth corresponde ao players.id esperado
  // se houver algum vínculo. Mas como o Admin usa o Supabase Auth diretamente para as roles,
  // isso já é suficiente para segurança do painel.
  
  return context.userId as string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// --- role check for the gate ---------------------------------------------

export const check_admin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { is_admin: !!data, user_id: context.userId };
  });

// --- turmas (grupos) e aprovações ------------------------------------------

export type PlayerGroupStatus = "pending" | "approved" | "rejected" | "suspended";

export type AdminGroup = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
  auto_open?: boolean;
  auto_close?: boolean;
  close_weekday?: number;
  close_time?: string;
};

export type PendingApproval = {
  player_id: string;
  first_name: string;
  last_name: string;
  phone_normalized: string;
  group_id: string;
  group_name: string;
  status: PlayerGroupStatus;
  requested_at: string;
};

export const admin_list_groups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_list_groups");
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminGroup[];
  });

const setGroupActiveSchema = z.object({
  group_id: z.string().uuid(),
  active: z.boolean(),
});

export const admin_set_group_active = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => setGroupActiveSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_group_active", {
      p_group_id: data.group_id,
      p_active: data.active,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const playerGroupsSchema = z.object({
  player_id: z.string().uuid(),
  group_ids: z.array(z.string().uuid()),
});

export const admin_set_player_groups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => playerGroupsSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_player_groups", {
      p_player_id: data.player_id,
      p_group_ids: data.group_ids,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const admin_get_player_groups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ player_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("player_groups")
      .select("group_id")
      .eq("player_id", data.player_id);
    if (error) throw new Error(error.message);
    return { group_ids: (rows ?? []).map((r: any) => r.group_id as string) };
  });

const updateAutomationSchema = z.object({
  group_id: z.string().uuid(),
  auto_open: z.boolean(),
  auto_close: z.boolean(),
  close_weekday: z.number().min(0).max(6),
  close_time: z.string(),
});

export const admin_update_automation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => updateAutomationSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_update_app_settings", {
      p_group_id: data.group_id,
      p_auto_open: data.auto_open,
      p_auto_close: data.auto_close,
      p_close_weekday: data.close_weekday,
      p_close_time: data.close_time,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateSettingsSchema = z.object({
  group_id: z.string().uuid(),
  name: z.string().optional(),
  active: z.boolean().optional(),
  open_weekday: z.number().min(0).max(6).optional(),
  open_time: z.string().optional(),
  priority_minutes: z.number().optional().nullable(),
  deadline_weekday: z.number().min(0).max(6).optional().nullable(),
  deadline_time: z.string().optional().nullable(),
  max_players: z.number().optional().nullable(),
  main_limit: z.number().optional().nullable(),
  max_waitlist: z.number().optional().nullable(),
  access_restriction_active: z.boolean().optional(),
  auto_promote: z.boolean().optional(),
  auto_generate_incidents: z.boolean().optional(),
  announcement: z.string().optional().nullable(),
  convidados_habilitados: z.boolean().optional(),
  dia_liberacao_convidado: z.number().min(0).max(6).optional().nullable(),
  hora_liberacao_convidado: z.string().optional().nullable(),
  limite_convidados_por_usuario: z.number().optional().nullable(),
  auto_open: z.boolean().optional(),
  auto_close: z.boolean().optional(),
  close_weekday: z.number().optional(),
  close_time: z.string().optional(),
  fund: z.object({
    suggested_amount: z.union([z.string(), z.number()]).optional(),
  }).optional(),
}).passthrough();

export type PlayerSelfRating = {
  id: string;
  player_id: string;
  reception_score: number | null;
  setting_score: number | null;
  attack_score: number | null;
  serve_score: number | null;
  block_score: number | null;
  defense_score: number | null;
  movement_score: number | null;
  positioning_score: number | null;
  primary_position: string | null;
  height_cm: number | null;
  overall_level: number | null;
  created_at: string;
  updated_at: string;
};

export const admin_get_player_self_rating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ player_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: row, error } = await sb
      .from("player_self_ratings")
      .select("*")
      .eq("player_id", data.player_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) throw new Error(error.message);
    return { rating: row as PlayerSelfRating };
  });


const listApprovalsSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended", "all"]).optional().default("pending"),
  search: z.string().optional().default(""),
});

export const admin_list_pending_approvals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listApprovalsSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    // Obter IDs dos grupos para mapear Terça, Quarta, Quinta, Sábado
    const { data: groups } = await sb.from('groups').select('id, slug, name').order('sort_order');
    const tGroup = groups?.find(g => g.slug === 'terca' || g.name.toLowerCase().includes('terça'));
    const wGroup = groups?.find(g => g.slug === 'quarta' || g.name.toLowerCase().includes('quarta'));
    const thGroup = groups?.find(g => g.slug === 'quinta' || g.name.toLowerCase().includes('quinta'));
    const sGroup = groups?.find(g => g.slug === 'sabado' || g.name.toLowerCase().includes('sábado'));

    // Queremos listar jogadores que tenham solicitações pendentes (ou filtrados por status)
    // Mas agora a visão é por JOGADOR, então vamos carregar a base de jogadores com seus vínculos.
    // admin_list_players_to_review já faz o agrupamento, mas ele foca em revisão de acessos existentes.
    // Para aprovações, queremos focar em quem TEM solicitações.
    
    let query = sb
      .from("players")
      .select(`
        id, 
        name, 
        phone_normalized, 
        created_at, 
        active,
        avatar_path,
        player_groups(group_id, status, requested_at, processed_at, rejection_reason)
      `)
      .eq('active', true);

    if (data.search) {
      const s = data.search.trim();
      const digits = s.replace(/[^0-9]/g, "");
      const s_norm = normalizePhone(s);
      if (digits.length >= 8) {
        query = query.or(`name.ilike.%${s}%,phone_normalized.ilike.%${s_norm}%`);
      } else {
        query = query.ilike('name', `%${s}%`);
      }

    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const result = (rows ?? []).map((p: any) => {
      const pgs = p.player_groups ?? [];
      const t = pgs.find((g: any) => g.group_id === tGroup?.id);
      const w = pgs.find((g: any) => g.group_id === wGroup?.id);
      const th = pgs.find((g: any) => g.group_id === thGroup?.id);
      const sa = pgs.find((g: any) => g.group_id === sGroup?.id);

      const hasPending = pgs.some((g: any) => g.status === 'pending');
      
      return {
        player_id: p.id,
        name: p.name,
        phone: p.phone_normalized,
        tuesday: t ? { group_id: t.group_id, status: t.status, requested_at: t.requested_at, processed_at: t.processed_at, rejection_reason: t.rejection_reason } : null,
        wednesday: w ? { group_id: w.group_id, status: w.status, requested_at: w.requested_at, processed_at: w.processed_at, rejection_reason: w.rejection_reason } : null,
        thursday: th ? { group_id: th.group_id, status: th.status, requested_at: th.requested_at, processed_at: th.processed_at, rejection_reason: th.rejection_reason } : null,
        saturday: sa ? { group_id: sa.group_id, status: sa.status, requested_at: sa.requested_at, processed_at: sa.processed_at, rejection_reason: sa.rejection_reason } : null,
        has_pending: hasPending
      };
    });

    // Filtrar por status se necessário
    let filtered = result;
    if (data.status === 'pending') {
      filtered = result.filter(r => r.has_pending);
    }

    return { 
      players: filtered,
      total_pending_requests: (rows ?? []).reduce((acc: number, p: any) => acc + (p.player_groups?.filter((g: any) => g.status === 'pending').length || 0), 0),
      total_pending_players: result.filter(r => r.has_pending).length,
      groups: {
        tuesday: tGroup?.id,
        wednesday: wGroup?.id,
        thursday: thGroup?.id,
        saturday: sGroup?.id
      }
    };
  });


const processRequestSchema = z.object({
  player_id: z.string().uuid(),
  group_id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  reason: z.string().optional().nullable(),
});

export const admin_process_group_request = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => processRequestSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const adminId = await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_process_group_request", {
      p_player_id: data.player_id,
      p_group_id: data.group_id,
      p_status: data.status,
      p_reason: data.reason || null,
      p_admin_user_id: adminId
    } as any);

    if (error) {
      console.error("[DIAGNOSTIC] admin_process_group_request failed:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw new Error(`[${error.code || 'DB_ERR'}] ${error.message} ${error.details ? `(${error.details})` : ''}`);
    }

    return { ok: true };

  });

// --- event details --------------------------------------------------------

const getEventSchema = z.object({
  event_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
  group_id: z.string().uuid().nullish().transform((v) => v ?? undefined),
});

export const get_admin_event = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => getEventSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    console.log("[ADMIN LIST] 1 - início get_admin_event", data);
    try {
      await assertAdmin(context);
      const sb = await admin();

      console.log("[ADMIN LIST] 2 - buscando configurações da turma:", data.group_id);
      let settingsQuery = sb.from("app_settings").select("*, group:groups(name)");
      if (data.group_id) settingsQuery = settingsQuery.eq("group_id", data.group_id);
      const { data: settingsRow, error: sError } = await settingsQuery
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (sError) {
        console.error("[ADMIN LIST] Erro ao buscar configurações:", sError);
        throw new Error(sError.message);
      }

      console.log("[ADMIN LIST] 3 - configurações encontradas:", settingsRow?.id);

      let eventRow: any = null;
      if (data.event_id) {
        console.log("[ADMIN LIST] 4 - buscando evento por ID:", data.event_id);
        const { data: e, error: eError } = await sb
          .from("volleyball_events")
          .select(
            "id, event_date, opens_at, status, location, start_time, end_time, main_limit, group_id",
          )
          .eq("id", data.event_id)
          .maybeSingle();
        if (eError) console.error("[ADMIN LIST] Erro ao buscar evento por ID:", eError);
        eventRow = e;
      } else {
        console.log("[ADMIN LIST] 4 - buscando evento atual via RPC para grupo:", data.group_id);
        const { data: evt, error: evtErr } = await sb.rpc("get_public_current_event", {
          p_group_id: data.group_id || undefined,
        });
        if (evtErr) console.error("[ADMIN LIST] Erro na RPC get_public_current_event:", evtErr);
        eventRow = Array.isArray(evt) ? evt[0] : (evt || null);
      }

      console.log("[ADMIN LIST] 5 - evento resolvido:", eventRow?.id, eventRow?.event_date);

      if (!eventRow) {
        console.log("[ADMIN LIST] 6 - nenhum evento encontrado.");
        return { event: null, registrations: [], teams: [], settings: settingsRow };
      }

      console.log("[ADMIN LIST] 7 - buscando inscrições para evento:", eventRow.id);
      const { data: regs, error: regsErr } = await sb
        .from("registrations")
        .select(`
          id, 
          player_id, 
          list_type, 
          position_number, 
          created_at, 
          registered_by_player_id,
          registration_source,
          attendance_status,
          verified_at,
          verified_by_admin_user_id
        `)
        .eq("event_id", eventRow.id)
        .is("cancelled_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (regsErr) {
        console.error("[ADMIN LIST] Erro ao buscar inscrições:", regsErr);
        throw new Error(`registrations_query_failed: ${regsErr.message}`);
      }

      console.log("[ADMIN LIST] 8 - inscrições brutas encontradas:", regs?.length);

      // Busca jogadores separadamente para evitar problemas de relacionamento join complexo
      const playerIds = Array.from(new Set((regs || []).map(r => r.player_id).filter(Boolean)));
      console.log("[ADMIN LIST] 9 - buscando dados dos jogadores para IDs:", playerIds.length);
      
      const { data: players, error: pError } = await sb
        .from("players")
        .select("id, name, phone_normalized, avatar_path")
        .in("id", playerIds);
      
      if (pError) console.error("[ADMIN LIST] Erro ao buscar dados dos jogadores:", pError);
      
      const { data: skills, error: skError } = await sb
        .from("player_skills")
        .select("player_id, primary_position")
        .in("player_id", playerIds);
      
      if (skError) console.error("[ADMIN LIST] Erro ao buscar skills dos jogadores:", skError);

      const playersMap = new Map((players || []).map(p => [p.id, p]));
      const skillsMap = new Map((skills || []).map((s: any) => [s.player_id, s]));

      console.log("[ADMIN LIST] 10 - buscando teams e fund statuses");
      const { data: teams } = await sb
        .from("teams")
        .select("id, team_number, team_members(registration_id, registrations(player:player_id(avatar_path)))")
        .eq("event_id", eventRow.id)
        .order("team_number");

      const { data: fundStatuses } = await sb.rpc("get_public_fund_player_statuses", {
        p_group_id: eventRow.group_id,
      });

      const fundMap = new Map();
      (fundStatuses || []).forEach((s: any) => fundMap.set(s.player_id, s));

      const enrichedRegs = (regs ?? []).map((r: any) => {
        const pId = r.player_id;
        const player = playersMap.get(pId);
        const skill = skillsMap.get(pId);
        const fs = fundMap.get(pId);
        
        let status = "pending";
        let label = "PENDENTE";

        if (fs) {
          status = fs.status;
          if (status === "in_full" || status === "overpaid") label = "PAGO";
          else if (status === "partial") label = "PARCIAL";
          else if (status === "payment_reported") label = "INFORMOU";
          else if (status === "exempt") label = "ISENTO";
          else if (status === "not_participating") label = "NÃO PARTICIPA";
        }

        return {
          ...r,
          player: player || null,
          player_skills: skill || null,
          payment_status: status,
          payment_status_label: label,
        };
      });

      console.log("[ADMIN LIST] 11 - buscando organizadores ativos da turma para badge");
      const { data: organizersData } = await sb
        .from("player_groups")
        .select("player_id")
        .eq("group_id", eventRow.group_id)
        .eq("is_organizer", true);
      
      const organizerIds = (organizersData || []).map(o => o.player_id);

      console.log("[ADMIN LIST] 12 - finalizando get_admin_event");
      return {
        event: eventRow,
        registrations: enrichedRegs,
        teams: teams ?? [],
        settings: settingsRow,
        organizers: (organizersData || [])
      };

    } catch (error: any) {
      console.error("[ADMIN LIST] ERRO FATAL no get_admin_event:", error);
      throw error;
    }
  });

// --- event status actions -------------------------------------------------

const setStatusSchema = z.object({
  event_id: z.string().uuid(),
  status: z.enum(["scheduled", "open", "closed", "completed", "cancelled"]),
});
export const admin_set_status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => setStatusSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();

    const { data: event, error: getErr } = await sb
      .from("volleyball_events")
      .select("id, status, group_id, event_date")
      .eq("id", data.event_id)
      .single();

    if (getErr || !event) throw new Error("Event not found");

    console.log("[OPEN ROUND] 1 - Request to set status:", data.status, "for event:", data.event_id);
    console.log("[OPEN ROUND] 2 - Current status:", event.status);

    const { error } = await context.supabase.rpc("admin_set_event_status", {
      p_event_id: data.event_id,
      p_status: data.status,
      p_manual_override: true,
      p_admin_user_id: uid,
    });
    
    if (error) {
      console.error("[OPEN ROUND ERROR]:", error);
      throw new Error(error.message);
    }

    console.log("[OPEN ROUND] 3 - Status updated successfully to:", data.status);

    // Se abrir a lista, garante que os organizadores sejam inscritos imediatamente
    if (data.status === "open") {
      try {
        console.log("[OPEN ROUND] 4 - Attempting to auto-enroll organizers for group:", event.group_id);
        const { admin_auto_enroll_organizers } = await import("./admin-extra.functions");
        
        const res = await admin_auto_enroll_organizers({
          data: { event_id: data.event_id, group_id: event.group_id }
        });
        console.log("[OPEN ROUND] 5 - Organizers enrollment result:", res);
      } catch (err) {
        console.error("[OPEN ROUND] Erro ao autoinscritor organizadores:", err);
      }
    }

    return { ok: true };
  });

const prioritySchema = z.object({
  group_id: z.string().uuid(),
  search: z.string().optional().default("")
});
export const admin_list_group_priorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => prioritySchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { data: rows, error } = await sb.rpc("admin_list_group_priorities", {
      p_group_id: data.group_id,
      p_search: data.search || undefined,
      p_admin_user_id: uid
    });
    if (error) throw new Error(error.message);
    return rows;
  });

const setPrioritySchema = z.object({
  player_id: z.string().uuid(),
  group_id: z.string().uuid(),
  has_priority: z.boolean()
});
export const admin_set_player_priority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => setPrioritySchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_set_player_priority", {
      p_player_id: data.player_id,
      p_group_id: data.group_id,
      p_has_priority: data.has_priority,
      p_admin_user_id: uid
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- next event: preview / create v2 / list ------------------------------

export function getNextGroupDate(groupWeekday: number, referenceDate: Date = new Date()): string {
  const timeZone = "America/Sao_Paulo";
  const zonedReference = toZonedTime(referenceDate, timeZone);
  
  // Encontrar o próximo dia da semana (groupWeekday: 0=dom, 2=ter, 3=qua, 4=qui, etc)
  let nextDate = zonedReference;
  const currentDay = nextDate.getDay();
  
  let daysToAdd = (groupWeekday - currentDay + 7) % 7;
  if (daysToAdd === 0) daysToAdd = 7; // Sempre a PRÓXIMA semana
  
  nextDate = addDays(nextDate, daysToAdd);
  
  // Retornar no formato YYYY-MM-DD (Civil Date) para evitar problemas de fuso
  return formatInTimeZone(nextDate, timeZone, "yyyy-MM-dd");
}


const groupOnlySchema = z.object({ group_id: z.string().uuid().optional().nullable() });

export const admin_preview_next_event = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => groupOnlySchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Uses the caller's authenticated client so auth.uid() is set inside the RPC
    const { data: res, error } = await context.supabase.rpc("admin_preview_next_event", {
      p_group_id: data.group_id ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return res as any;
  });

export const admin_create_next_event = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => groupOnlySchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    
    // Se não tiver group_id, falhar
    if (!data.group_id) throw new Error("Group ID is required");

    // Buscar configurações da turma para saber o dia da semana
    const sb = await admin();
    const { data: settings, error: sError } = await sb
      .from("app_settings")
      .select("open_weekday, main_limit")
      .eq("group_id", data.group_id)
      .maybeSingle();

    if (sError) throw new Error(sError.message);
    if (!settings) throw new Error("Configurações da turma não encontradas. Configure a turma antes de criar rodadas.");

    // Calcular data da próxima rodada (baseado no open_weekday ou no dia atual da semana)
    // Se o open_weekday não estiver definido, usamos o dia atual? 
    // Na verdade, a RPC admin_create_next_event_v2 já deveria saber disso, mas vamos garantir.
    
    const { data: res, error } = await context.supabase.rpc("admin_create_next_event_v2", {
      p_group_id: data.group_id,
    } as any);

    if (error) throw new Error(error.message);
    return res as any;
  });

export const admin_list_events = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => groupOnlySchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_list_events", {
      p_group_id: data.group_id ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return (res ?? []) as any[];
  });


// --- add / remove / move registrations -----------------------------------

const addPlayerSchema = z.object({
  event_id: z.string().uuid(),
  player_id: z.string().uuid(),
  list_type: z.enum(["main", "wait"]),
  force: z.boolean().optional().default(false),
  override_reason: z.string().optional(),
});
export const admin_add = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => addPlayerSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    
    console.log("[ADMIN ADD] calling admin_add_player", {
      player_id: data.player_id,
      event_id: data.event_id,
      list_type: data.list_type,
      force: data.force
    });

    try {
      const { data: rows, error } = await sb.rpc("admin_add_player", {
        p_event_id: data.event_id,
        p_target_player_id: data.player_id,
        p_list_type: data.list_type,
        p_admin_user_id: uid,
        p_force_override: data.force || false,
        p_registration_source: 'admin'
      });

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!error && data.force && data.override_reason) {
        await sb.from("admin_actions_log").insert({
          admin_user_id: uid,
          action: "admin_override_disciplinary",
          target_type: "registration",
          target_id: row?.out_registration_id,
          details: { reason: data.override_reason, player_id: data.player_id, event_id: data.event_id }
        });
      }

      if (error) {
        console.error("[ADMIN ADD] PostgreSQL error:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw new Error(error.message);
      }
      
      console.log("[ADMIN ADD] rpc success", rows);
      return { row: Array.isArray(rows) ? rows[0] : rows };
    } catch (e: any) {
      console.error("[ADMIN ADD] Exception:", e);
      throw e;
    }
  });

const removeSchema = z.object({ registration_id: z.string().uuid() });
export const admin_remove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => removeSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    console.log("[ADMIN REMOVE] Executing removal via RPC admin_remove_registration_v2:", {
      registration_id: data.registration_id,
      admin_id: uid
    });

    // Chamada única e atômica via RPC v3
    const { data: res, error: rpcError } = await supabaseAdmin.rpc("admin_remove_registration_v3", {
      p_registration_id: data.registration_id,
      p_admin_user_id: uid,
    });

    if (rpcError) {
      console.error("[ADMIN REMOVE] RPC Error:", rpcError);
      throw new Error(rpcError.message || "Erro ao processar remoção no banco de dados.");
    }
    
    return { ok: true, result: res };
  });

const moveSchema = z.object({
  registration_id: z.string().uuid(),
  new_list: z.enum(["main", "wait"]),
  new_position: z.number().int().min(1),
});
export const admin_move = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => moveSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_move", {
      p_registration_id: data.registration_id,
      p_new_list: data.new_list,
      p_new_position: data.new_position,
      p_admin_user_id: uid,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- players search & blocks ---------------------------------------------

const searchSchema = z.object({ query: z.string().min(1).max(80), group_id: z.string().uuid().optional() });
export const admin_search_players = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => searchSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const q = data.query.trim().toLowerCase();
    
    // Busca jogadores (global)
    let query = sb
      .from("players")
      .select(`
        id, 
        name, 
        phone_normalized,
        active
      `)
      .or(`name.ilike.%${q}%,phone_normalized.ilike.%${q}%`)
      .limit(50);
      
    const { data: players, error } = await query;
    if (error) throw new Error(error.message);

    if (data.group_id && players && players.length > 0) {
      const playerIds = players.map(p => p.id);
      const { data: groupLinks } = await sb
        .from("player_groups")
        .select("player_id, status, is_organizer")
        .eq("group_id", data.group_id)
        .in("player_id", playerIds);
      
      const linkMap = new Map((groupLinks || []).map(l => [l.player_id, l]));
      
      return { 
        players: players.map(p => ({
          ...p,
          group_status: linkMap.get(p.id)?.status || "none",
          is_organizer: linkMap.get(p.id)?.is_organizer || false
        }))
      };
    }

    return { players: (players ?? []).map(p => ({ ...p, group_status: "none", is_organizer: false })) };
  });

const setOrganizerSchema = z.object({
  player_id: z.string().uuid(),
  group_id: z.string().uuid(),
  is_organizer: z.boolean(),
  order: z.number().int().min(1).optional(),
});

export const admin_set_player_organizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => setOrganizerSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();

    let nextOrder: number | null = null;
    if (data.is_organizer) {
      const { data: existing } = await sb
        .from("player_groups")
        .select("player_id, organizer_order")
        .eq("group_id", data.group_id)
        .eq("is_organizer", true);

      const taken = new Set(
        (existing ?? [])
          .filter((r: any) => r.player_id !== data.player_id && r.organizer_order != null)
          .map((r: any) => r.organizer_order as number)
      );

      // Usa a ordem pedida se estiver livre; senão, a primeira posição disponível
      if (data.order && !taken.has(data.order)) {
        nextOrder = data.order;
      } else {
        let candidate = 1;
        while (taken.has(candidate)) candidate++;
        nextOrder = candidate;
      }
    }

    const { error } = await sb
      .from("player_groups")
      .update({ 
        is_organizer: data.is_organizer, 
        organizer_order: nextOrder 
      })
      .match({ player_id: data.player_id, group_id: data.group_id });
    
    if (error) throw new Error(error.message);
    return { ok: true, order: nextOrder };
  });

export const admin_reorder_organizers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({
    group_id: z.string().uuid(),
    orders: z.array(z.object({
      player_id: z.string().uuid(),
      order: z.number().int().min(1)
    }))
  }).parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    // Processamento sequencial simples para garantir a trigger de unicidade (embora possa falhar se não houver um "swap" inteligente)
    // Para simplificar e evitar conflitos de trigger, primeiro limpamos as ordens dos afetados (não é o ideal mas funciona para evitar duplicidade temporária)
    for (const item of data.orders) {
      await sb
        .from("player_groups")
        .update({ organizer_order: 999 + Math.floor(Math.random() * 1000) }) // Temp order
        .match({ player_id: item.player_id, group_id: data.group_id });
    }

    for (const item of data.orders) {
      const { error } = await sb
        .from("player_groups")
        .update({ organizer_order: item.order })
        .match({ player_id: item.player_id, group_id: data.group_id });
      if (error) throw new Error(error.message);
    }
    
    return { ok: true };
  });

export const admin_trigger_auto_enroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ event_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_auto_enroll_organizers", {
      p_event_id: data.event_id
    });
    if (error) throw new Error(error.message);
    return res as any;
  });
// --- end of organizers functions ---


// Lista paginada de todos os jogadores, com filtro opcional por nome/telefone e por status.
const listPlayersSchema = z.object({
  query: z.string().max(80).optional().default(""),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(25),
  status: z.enum(["active", "inactive", "all"]).optional().default("active"),
});
export const admin_list_players = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listPlayersSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const page = data.page;
    const size = data.page_size;
    const from = (page - 1) * size;
    const to = from + size - 1;
    const q = (data.query ?? "").trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    const q_norm = normalizePhone(q);

    let query = sb
      .from("players")
      .select("id, name, phone_normalized, created_at, active, disabled_at, disabled_reason, avatar_path, avatar_status, avatar_uploaded_at, player_groups(group_id, is_organizer, organizer_order)", {
        count: "exact",
      });

    if (data.status === "active") query = query.eq("active", true);
    else if (data.status === "inactive") query = query.eq("active", false);

    if (q) {
      if (digits.length >= 8) {
        query = query.or(`name.ilike.%${q}%,phone_normalized.ilike.%${q_norm}%`);
      } else {
        query = query.or(`name.ilike.%${q}%,phone_normalized.ilike.%${q_norm}%`);
      }
    }


    const {
      data: rows,
      error,
      count,
    } = await query.order("name_normalized", { ascending: true }).range(from, to);
    if (error) throw new Error(error.message);
    return {
      players: rows ?? [],
      total: count ?? 0,
      page,
      page_size: size,
      status: data.status,
    };
  });

// Desativar jogador (mantém histórico)
const deactivateSchema = z.object({
  player_id: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});
export const admin_deactivate_player = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => deactivateSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_deactivate_player", {
      p_player_id: data.player_id,
      p_reason: data.reason ?? "",
      p_admin_user_id: uid,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reativar jogador
const reactivateSchema = z.object({ player_id: z.string().uuid() });
export const admin_reactivate_player = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => reactivateSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_reactivate_player", {
      p_player_id: data.player_id,
      p_admin_user_id: uid,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Excluir permanentemente (somente sem histórico)
const deleteSchema = z.object({ player_id: z.string().uuid() });
export const admin_delete_player = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => deleteSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_delete_player", {
      p_player_id: data.player_id,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

const blockSchema = z.object({
  player_id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  reason: z.string().max(500).optional().nullable(),
  admin_notes: z.string().max(1000).optional().nullable(),
  // null => bloqueio global (todas as turmas)
  group_id: z.string().uuid().optional().nullable(),
});
export const admin_create_block = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => blockSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { data: id, error } = await sb.rpc("admin_block_player", {
      p_player_id: data.player_id,
      p_starts_at: data.starts_at,
      p_ends_at: data.ends_at,
      p_reason: data.reason ?? "",
      p_admin_notes: data.admin_notes ?? "",
      p_admin_user_id: uid,
      p_group_id: data.group_id ?? null,
    } as any);
    if (error) throw new Error(error.message);

    return { id };
  });

const unblockSchema = z.object({ block_id: z.string().uuid() });
export const admin_end_block = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => unblockSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_unblock_player", {
      p_block_id: data.block_id,
      p_admin_user_id: uid,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const listBlocksSchema = z.object({ player_id: z.string().uuid() });
export const admin_list_blocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listBlocksSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("player_blocks")
      .select("*")
      .eq("player_id", data.player_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { blocks: rows ?? [] };
  });

// --- teams ---------------------------------------------------------------

const saveTeamsSchema = z.object({
  event_id: z.string().uuid(),
  assignments: z.array(
    z.object({
      team_number: z.number().int().min(1).max(3),
      registration_ids: z.array(z.string().uuid()).max(10),
    }),
  ),
});
export const admin_save_teams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => saveTeamsSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_save_teams", {
      p_event_id: data.event_id,
      p_assignments: data.assignments,
      p_admin_user_id: uid,
    });
    if (error) throw new Error(error.message);

    // Notificar jogadores sobre a publicação dos times
    try {
      const { internalCreateNotification } = await import("./notifications.functions");
      
      // Buscar o nome do grupo e a data do evento para o corpo da notificação
      const { data: eventData } = await sb
        .from("volleyball_events")
        .select("event_date, groups(name, slug)")
        .eq("id", data.event_id)
        .single();

      if (eventData) {
        const groupName = (eventData.groups as any)?.name || "sua turma";
        const groupSlug = (eventData.groups as any)?.slug;
        const formattedDate = new Date(eventData.event_date).toLocaleDateString('pt-BR');

        // Buscar todos os jogadores que têm uma vaga (titulares) no evento
        const { data: registrations } = await sb
          .from("registrations")
          .select("player_id")
          .eq("event_id", data.event_id)
          .eq("list_type", "main")
          .is("cancelled_at", null);

        if (registrations) {
          for (const reg of registrations) {
            await internalCreateNotification({
              player_id: reg.player_id,
              type: 'teams_published',
              group_id: groupSlug, // Usamos o slug para deep link
              event_id: data.event_id,
              metadata: {
                turma: groupName,
                data: formattedDate
              },
              idempotency_key: `teams-${data.event_id}-${reg.player_id}-${new Date().toISOString().split('T')[0]}` // Evita duplicação no mesmo dia
            });
          }
        }
      }
    } catch (e) {
      console.error("[NOTIFICATIONS] Error sending teams_published:", e);
    }

    return { ok: true };
  });

// --- settings ------------------------------------------------------------

// updateSettingsSchema já declarado no topo do arquivo




// --- incidents (Lote D1) --------------------------------------------------

const listIncidentsSchema = z.object({
  status: z
    .enum(["pending", "applied", "justified", "cancelled", "completed", "all"])
    .optional()
    .default("all"),
  incident_type: z.enum(["late_leave", "no_show", "all"]).optional().default("all"),
  player_name: z.string().max(80).optional().default(""),
  event_id: z.string().uuid().optional().nullable(),
  group_id: z.string().uuid().optional().nullable(),
});

export const admin_list_incidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listIncidentsSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();

    let q = sb
      .from("player_incidents")
      .select(
        "id, incident_type, status, occurred_at, suggested_rounds, applied_rounds, justification, admin_notes, decided_at, block_id, player_id, event_id, group_id, players!player_incidents_player_id_fkey(name), volleyball_events!player_incidents_event_id_fkey(event_date, status)",
      )
      .order("occurred_at", { ascending: false })
      .limit(500);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.incident_type !== "all") q = q.eq("incident_type", data.incident_type);
    if (data.event_id) q = q.eq("event_id", data.event_id);
    if (data.group_id) q = q.eq("group_id", data.group_id);


    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const nameFilter = (data.player_name ?? "").trim().toLowerCase();
    const mapped = (rows ?? []).map((r: any) => ({
      incident_id: r.id as string,
      incident_type: r.incident_type as "late_leave" | "no_show",
      status: r.status as "pending" | "applied" | "justified" | "cancelled" | "completed",
      occurred_at: r.occurred_at as string,
      suggested_rounds: r.suggested_rounds as number,
      applied_rounds: r.applied_rounds as number | null,
      justification: (r.justification ?? null) as string | null,
      admin_notes: (r.admin_notes ?? null) as string | null,
      decided_at: (r.decided_at ?? null) as string | null,
      block_id: (r.block_id ?? null) as string | null,
      player_id: r.player_id as string,
      player_name: (r.players?.name ?? "") as string,
      event_id: r.event_id as string,
      event_date: (r.volleyball_events?.event_date ?? null) as string | null,
      event_status: (r.volleyball_events?.status ?? null) as string | null,
    }));

    const filtered = nameFilter
      ? mapped.filter((i) => i.player_name.toLowerCase().includes(nameFilter))
      : mapped;

    return { incidents: filtered };
  });

const acceptIncSchema = z.object({
  incident_id: z.string().uuid(),
  justification: z.string().trim().min(3).max(2000),
  admin_notes: z.string().max(2000).optional().nullable(),
});
export const admin_accept_incident_justification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => acceptIncSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { data: result, error } = await sb.rpc("admin_accept_incident_justification", {
      p_incident_id: data.incident_id,
      p_admin_user_id: uid,
      p_justification: data.justification,
      p_admin_notes: data.admin_notes ?? "",
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

const cancelIncSchema = z.object({
  incident_id: z.string().uuid(),
  admin_notes: z.string().trim().min(3).max(2000),
});
export const admin_cancel_incident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => cancelIncSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { data: result, error } = await sb.rpc("admin_cancel_incident", {
      p_incident_id: data.incident_id,
      p_admin_user_id: uid,
      p_admin_notes: data.admin_notes,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

const updateIncNotesSchema = z.object({
  incident_id: z.string().uuid(),
  admin_notes: z.string().max(2000),
});
export const admin_update_incident_notes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => updateIncNotesSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { data: result, error } = await sb.rpc("admin_update_incident_notes", {
      p_incident_id: data.incident_id,
      p_admin_user_id: uid,
      p_admin_notes: data.admin_notes,
    });
    if (error) throw new Error(error.message);
    return result as any;
  });

const filterGlobalPrioritiesSchema = z.object({ 
  search: z.string().optional().default(""), 
  filter: z.string().optional().default("all"),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(50)
});
export const admin_list_global_priorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => filterGlobalPrioritiesSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    
    // O backend agora possui a RPC admin_list_global_priorities,
    // que centraliza a lógica de leitura com paginação e filtros.
    const { data: res, error } = await sb.rpc("admin_list_global_priorities", {
      p_search: data.search || undefined,
      p_filter: data.filter || 'all',
      p_page: data.page,
      p_limit: data.page_size,
      p_admin_user_id: uid
    });

    if (error) {
      console.error("[ADMIN_LIST_GLOBAL_PRIORITIES] DB Error:", error);
      throw new Error(`Falha na consulta: ${error.message} (Code: ${error.code})`);
    }

    return res as { players: any[]; total: number; page: number; limit: number };
  });

const setGlobalPrioritySchema = z.object({ player_id: z.string().uuid(), has_priority: z.boolean() });
export const admin_set_global_priority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => setGlobalPrioritySchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("admin_set_global_priority", {
      p_player_id: data.player_id,
      p_has_priority: data.has_priority,
      p_admin_user_id: uid
    });

    if (error) {
      console.error("[ADMIN_SET_GLOBAL_PRIORITY] DB Error:", error);
      throw new Error(`Falha na atualização: ${error.message} (Code: ${error.code})`);
    }
    return { ok: true };
  });

// --- fund config (Lote R2) ------------------------------------------------

export type FundRow = {
  id: string;
  title: string;
  total_amount: number | string;
  due_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  scope?: "global" | "group";
  group_ids?: string[];
};

export type FundTotals = {
  total_amount: number;
  collected: number;
  remaining: number;
  percent: number;
  excess: number;
  committed: number;
  without_owner: number;
  participants_count: number;
  linked_players_count: number;
  participants_without_player_count: number;
};

export const admin_get_fund_config = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => groupOnlySchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // As RPCs do rateio usam auth.uid(); precisam do cliente com JWT do usuário,
    // não do supabaseAdmin (service role → auth.uid() nulo → not_authorized).
    const { data: res, error } = await context.supabase.rpc("admin_get_fund_config", {
      p_group_id: data.group_id ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return res as unknown as { active: FundRow | null; history: FundRow[] };
  });

const upsertFundSchema = z.object({
  title: z.string().trim().min(2, "Título deve ter ao menos 2 caracteres").max(120),
  total_amount: z.number().nonnegative("Valor não pode ser negativo"),
  due_date: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean(),
  scope: z.enum(["global", "group"]).optional().nullable(),
  group_ids: z.array(z.string().uuid()).optional().nullable(),
  fund_id: z.string().uuid().optional().nullable(),
});

// Schema já definido no topo da seção de settings


export const admin_upsert_fund_config = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => upsertFundSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_upsert_fund_config", {
      p_title: data.title,
      p_total_amount: data.total_amount,
      p_due_date: (data.due_date ?? null) as unknown as string,
      p_notes: (data.notes ?? null) as unknown as string,
      p_is_active: data.is_active,
      p_scope: (data.scope ?? null) as unknown as string,
      p_group_ids: (data.group_ids ?? null) as unknown as string[],
      p_fund_id: (data.fund_id ?? null) as unknown as string,
    } as any);

    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; fund_id: string | null; action: string };
  });


const fundDashboardSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
});

export const admin_get_fund_dashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => fundDashboardSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_get_fund_dashboard", {
      p_fund_id: data.fund_id ?? undefined,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { fund: FundRow | null; totals?: FundTotals };
  });

// --- fund participants (Lote R3) ------------------------------------------

export type FundParticipantStatus =
  | "pending"
  | "partial"
  | "in_full"
  | "overpaid"
  | "exempt"
  | "not_participating"
  | "to_define"
  | "payment_reported";

export type FundParticipantListItem = {
  id: string;
  fund_id: string;
  name: string;
  external_ref: string | null;
  participates: boolean;
  exempt: boolean;
  agreed_amount: number | string | null;
  notes: string | null;
  players_count: number;
  total_paid: number | string;
  balance: number | string;
  credit: number | string;
  status: FundParticipantStatus;
  payment_reported: boolean;
  payment_reported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FundParticipantPlayerLink = {
  player_id: string;
  player_name: string;
  phone_normalized: string | null;
  linked_at: string;
};

export type FundParticipantListItemWithPlayers = FundParticipantListItem & {
  players: FundParticipantPlayerLink[];
};

const listParticipantsSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
  search: z.string().max(120).nullable().optional(),
  status_filter: z
    .enum([
      "all",
      "pending",
      "partial",
      "in_full",
      "overpaid",
      "exempt",
      "not_participating",
      "to_define",
      "payment_reported",
      "no_link",
    ])
    .nullable()
    .optional(),
});

export const admin_list_fund_participants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listParticipantsSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_list_fund_participants", {
      p_fund_id: (data.fund_id ?? null) as unknown as string,
      p_search: (data.search ?? null) as unknown as string,
      p_status:
        !data.status_filter || data.status_filter === "all"
          ? (null as unknown as string)
          : data.status_filter,
    });

    if (error) throw new Error(error.message);
    return res as unknown as {
      fund_id: string | null;
      items: FundParticipantListItemWithPlayers[];
    };
  });

const getParticipantSchema = z.object({ participant_id: z.string().uuid() });

export const admin_get_fund_participant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => getParticipantSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_get_fund_participant", {
      p_participant_id: data.participant_id,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      participant: FundParticipantListItem;
      players: FundParticipantPlayerLink[];
      payments: Array<{
        id: string;
        amount: number | string;
        paid_at: string;
        payer_name: string | null;
        notes: string | null;
      }>;
    };
  });

const upsertParticipantSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(120).nullable().optional(),
  participates: z.boolean(),
  exempt: z.boolean(),
  agreed_amount: z.number().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  initial_player_id: z.string().uuid().nullable().optional(),
});

export const admin_create_fund_participant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => upsertParticipantSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_create_fund_participant", {
      p_fund_id: (data.fund_id ?? null) as unknown as string,
      p_name: data.name,
      p_phone: (data.phone ?? null) as unknown as string,
      p_participates: data.participates,
      p_exempt: data.exempt,
      p_agreed_amount: (data.agreed_amount ?? null) as unknown as number,
      p_notes: (data.notes ?? null) as unknown as string,
      p_link_player_id: (data.initial_player_id ?? null) as unknown as string,
    });

    if (error) throw new Error(error.message);
    return res as unknown as {
      ok: boolean;
      fund_id: string;
      participant_id: string;
    };
  });

const updateParticipantSchema = z.object({
  participant_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(120).nullable().optional(),
  participates: z.boolean(),
  exempt: z.boolean(),
  agreed_amount: z.number().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const admin_update_fund_participant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => updateParticipantSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_update_fund_participant", {
      p_participant_id: data.participant_id,
      p_name: data.name,
      p_phone: (data.phone ?? null) as unknown as string,
      p_participates: data.participates,
      p_exempt: data.exempt,
      p_agreed_amount: (data.agreed_amount ?? null) as unknown as number,
      p_notes: (data.notes ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; participant_id: string };
  });

const searchPlayersFundSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
  query: z.string().trim().max(120),
});

export const admin_search_players_for_fund_link = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => searchPlayersFundSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_search_players_for_fund_link", {
      p_fund_id: (data.fund_id ?? null) as unknown as string,
      p_search: data.query,
    });

    if (error) throw new Error(error.message);
    const raw = (res as { items?: Array<Record<string, unknown>> } | null) ?? { items: [] };
    const items = Array.isArray(raw.items) ? raw.items : [];
    return items.map((it) => ({
      id: String(it.player_id ?? ""),
      name: String(it.name ?? ""),
      phone_normalized: (it.phone_normalized as string | null) ?? null,
    })) as Array<{ id: string; name: string; phone_normalized: string | null }>;
  });

const linkSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
  participant_id: z.string().uuid(),
  player_id: z.string().uuid(),
});

export const admin_link_player_to_fund_participant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => linkSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc(
      "admin_link_player_to_fund_participant",
      {
        p_fund_id: (data.fund_id ?? null) as unknown as string,
        p_participant_id: data.participant_id,
        p_player_id: data.player_id,
      },
    );
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean };
  });

export const admin_unlink_player_from_fund_participant = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => linkSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc(
      "admin_unlink_player_from_fund_participant",
      {
        p_fund_id: (data.fund_id ?? null) as unknown as string,
        p_participant_id: data.participant_id,
        p_player_id: data.player_id,
      },
    );
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean };
  });

// --- fund payments (Lote R4) ----------------------------------------------

export type FundPaymentKind = "linked" | "anon";

export type FundPaymentListItem = {
  id: string;
  fund_id: string;
  participant_id: string | null;
  participant_name: string | null;
  payer_name: string | null;
  display_name: string | null;
  kind: FundPaymentKind;
  amount: number | string;
  paid_at: string;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FundPaymentDetail = FundPaymentListItem;

const listFundPaymentsSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
  participant_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["all", "linked", "anon"]).nullable().optional(),
  search: z.string().max(120).nullable().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  limit: z.number().int().min(1).max(500).nullable().optional(),
});

export const admin_list_fund_payments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listFundPaymentsSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_list_fund_payments", {
      p_fund_id: (data.fund_id ?? null) as unknown as string,
      p_participant_id: (data.participant_id ?? null) as unknown as string,
      p_kind: (data.kind ?? null) as unknown as string,
      p_search: (data.search ?? null) as unknown as string,
      p_from: (data.from ?? null) as unknown as string,
      p_to: (data.to ?? null) as unknown as string,
      p_limit: (data.limit ?? null) as unknown as number,
    });
    if (error) throw new Error(error.message);
    return res as unknown as {
      fund_id: string | null;
      items: FundPaymentListItem[];
      limit?: number;
    };
  });

const getFundPaymentSchema = z.object({ payment_id: z.string().uuid() });

export const admin_get_fund_payment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => getFundPaymentSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_get_fund_payment", {
      p_payment_id: data.payment_id,
    });
    if (error) throw new Error(error.message);
    return res as unknown as FundPaymentDetail;
  });

const addFundPaymentSchema = z
  .object({
    fund_id: z.string().uuid().nullable().optional(),
    participant_id: z.string().uuid().nullable().optional(),
    payer_name: z.string().trim().max(160).nullable().optional(),
    amount: z.number().positive("Valor deve ser maior que zero"),
    paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    payment_method: z.string().trim().max(80).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => !!v.participant_id || !!(v.payer_name && v.payer_name.trim().length >= 1), {
    message: "Informe o participante ou o nome do pagador.",
    path: ["payer_name"],
  });

export const admin_add_fund_payment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => addFundPaymentSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_add_fund_payment", {
      p_fund_id: (data.fund_id ?? null) as unknown as string,
      p_participant_id: (data.participant_id ?? null) as unknown as string,
      p_payer_name: (data.payer_name ?? null) as unknown as string,
      p_amount: data.amount,
      p_paid_at: data.paid_at,
      p_payment_method: (data.payment_method ?? null) as unknown as string,
      p_notes: (data.notes ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; payment_id: string; fund_id: string };
  });

const updateFundPaymentSchema = z
  .object({
    payment_id: z.string().uuid(),
    participant_id: z.string().uuid().nullable().optional(),
    payer_name: z.string().trim().max(160).nullable().optional(),
    amount: z.number().positive("Valor deve ser maior que zero"),
    paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    payment_method: z.string().trim().max(80).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => !!v.participant_id || !!(v.payer_name && v.payer_name.trim().length >= 1), {
    message: "Informe o participante ou o nome do pagador.",
    path: ["payer_name"],
  });

export const admin_update_fund_payment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => updateFundPaymentSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_update_fund_payment", {
      p_payment_id: data.payment_id,
      p_participant_id: (data.participant_id ?? null) as unknown as string,
      p_payer_name: (data.payer_name ?? null) as unknown as string,
      p_amount: data.amount,
      p_paid_at: data.paid_at,
      p_payment_method: (data.payment_method ?? null) as unknown as string,
      p_notes: (data.notes ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; payment_id: string };
  });

const deleteFundPaymentSchema = z.object({ payment_id: z.string().uuid() });

export const admin_delete_fund_payment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => deleteFundPaymentSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_delete_fund_payment", {
      p_payment_id: data.payment_id,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; payment_id: string; fund_id: string };
  });

// --- Atualizar nome do jogador (admin) -----------------------------------

const adminUpdateNameSchema = z.object({
  player_id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

export const admin_update_player_name = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => adminUpdateNameSchema.parse(r))
  .handler(async ({ data, context }) => {
    const adminId = await assertAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_update_player_name", {
      p_player_id: data.player_id,
      p_new_name: data.name,
      p_admin_user_id: adminId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { player_id: row?.player_id ?? data.player_id, name: row?.name ?? data.name };
  });

// --- Solicitar troca de senha (admin) ------------------------------------

const adminRequestPinResetSchema = z.object({ player_id: z.string().uuid() });

export const admin_request_pin_reset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => adminRequestPinResetSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_request_pin_reset", {
      p_player_id: data.player_id
    } as any);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      player_id: row?.player_id ?? data.player_id,
      revoked_sessions: row?.revoked_sessions ?? 0,
    };
  });

const setPaymentReportedSchema = z.object({
  participant_id: z.string().uuid(),
  value: z.boolean(),
});

export const admin_set_payment_reported = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => setPaymentReportedSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc("admin_set_payment_reported", {
      p_participant_id: data.participant_id,
      p_value: data.value,
    });
    if (error) throw new Error(error.message);
    return res as unknown as { ok: boolean; participant_id: string; payment_reported: boolean };
  });

// ============= HABILIDADES (avaliação técnica global por jogador) =============

const positionEnum = z.enum([
  "setter",
  "outside",
  "middle",
  "opposite",
  "libero",
  "undefined",
]);


export type AdminSkillRow = {
  player_id: string;
  name: string;
  phone_normalized: string;
  active: boolean;
} & Partial<Record<SkillKey, number | null>> & {
  primary_position: string;
  height_cm: number | null;
  notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
  self_rating?: any;
};

export const admin_get_skill_weights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data, error } = await (sb as any)
      .from("skill_weights")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    let w = data;
    if (!w || typeof w.reception_score !== 'number') {
      w = {
        reception_score: 15,
        setting_score: 15,
        attack_score: 15,
        serve_score: 10,
        block_score: 15,
        defense_score: 15,
        movement_score: 10,
        positioning_score: 5,
      };
    }
    return { weights: w };
  });

const weightsSchema = z
  .object({
    reception_score: z.number().int().min(0).max(100).optional(),
    setting_score: z.number().int().min(0).max(100).optional(),
    attack_score: z.number().int().min(0).max(100).optional(),
    serve_score: z.number().int().min(0).max(100).optional(),
    block_score: z.number().int().min(0).max(100).optional(),
    defense_score: z.number().int().min(0).max(100).optional(),
    movement_score: z.number().int().min(0).max(100).optional(),
    positioning_score: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();

export const admin_update_skill_weights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => weightsSchema.parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { error } = await (sb as any)
      .from("skill_weights")
      .upsert({ id: true, ...data, updated_by: uid }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    await (sb as any).from("admin_actions_log").insert({
      admin_user_id: uid,
      action: "skill_weights_update",
      target_type: "skill_weights",
      details: data,
    });
    return { ok: true };
  });


const listSkillsSchema = z.object({
  query: z.string().max(80).optional().default(""),
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  evaluated: z.enum(["all", "yes", "no"]).optional().default("all"),
  sort: z
    .enum(["name", "level_desc", "level_asc", "updated_desc", "updated_asc"])
    .optional()
    .default("name"),
});

export const admin_list_player_skills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listSkillsSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();

    let pq = sb.from("players").select("id, name, phone_normalized, active");
    if (data.status === "active") pq = pq.eq("active", true);
    else if (data.status === "inactive") pq = pq.eq("active", false);

    const q = (data.query ?? "").trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    if (q.length > 0) {
      if (digits.length >= 2) {
        pq = pq.or(`name_normalized.ilike.%${q}%,phone_normalized.ilike.%${digits}%`);
      } else {
        pq = pq.ilike("name_normalized", `%${q}%`);
      }
    }

    const { data: players, error } = await pq
      .order("name_normalized", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    const { data: skills, error: sErr } = await (sb as any)
      .from("player_skills")
      .select("*");
    if (sErr) throw new Error(sErr.message);
    
    const { data: selfRatings } = await (sb as any)
      .from("player_self_ratings")
      .select("*");

    const byPlayer = new Map<string, any>();
    for (const s of skills ?? []) byPlayer.set(s.player_id, s);

    const selfByPlayer = new Map<string, any>();
    for (const sr of selfRatings ?? []) selfByPlayer.set(sr.player_id, sr);

    const rows: AdminSkillRow[] = (players ?? []).map((p: any) => {
      const s = byPlayer.get(p.id);
      const sr = selfByPlayer.get(p.id);
      const row: any = {
        player_id: p.id,
        name: p.name,
        phone_normalized: p.phone_normalized,
        active: p.active,
        primary_position: s?.primary_position ?? "undefined",
        height_cm: s?.height_cm ?? null,
        notes: s?.notes ?? null,
        updated_at: s?.updated_at ?? null,
        updated_by: s?.updated_by ?? null,
        self_rating: sr || null,
      };
      for (const k of SKILL_KEYS) {
        // Garantir que 0 seja retornado se for o valor no banco, e não fallback para null
        const val = s?.[k];
        row[k] = (typeof val === 'number') ? val : null;
      }
      return row as AdminSkillRow;
    });

    const evaluatedOf = (r: AdminSkillRow) =>
      SKILL_KEYS.every((k) => typeof (r as any)[k] === "number" && (r as any)[k] !== null);

    const filtered =
      data.evaluated === "all"
        ? rows
        : rows.filter((r) => (data.evaluated === "yes" ? evaluatedOf(r) : !evaluatedOf(r)));

    return { players: filtered };
  });

/** As oito notas técnicas são opcionais (inteiro 0–5). */
const optionalScoreField = z
  .number()
  .int("A nota deve ser um número inteiro entre 0 e 5.")
  .min(0, "A nota deve ser um número inteiro entre 0 e 5.")
  .max(5, "A nota deve ser um número inteiro entre 0 e 5.")
  .nullable()
  .optional();

const upsertSkillsSchema = z.object({
  player_id: z.string().uuid(),
  reception_score: optionalScoreField,
  setting_score: optionalScoreField,
  attack_score: optionalScoreField,
  serve_score: optionalScoreField,
  block_score: optionalScoreField,
  defense_score: optionalScoreField,
  positioning_score: optionalScoreField,
  primary_position: positionEnum.optional().default("undefined"),
  height_cm: z
    .number()
    .int("Informe uma altura válida em centímetros.")
    .min(100, "Informe uma altura válida em centímetros.")
    .max(250, "Informe uma altura válida em centímetros.")
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
});


export const admin_upsert_player_skills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.record(z.any()).parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();

    const { data: player, error: pErr } = await sb
      .from("players")
      .select("id")
      .eq("id", data.player_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!player) throw new Error("player_not_found");

    const { data: previous } = await (sb as any)
      .from("player_skills")
      .select("*")
      .eq("player_id", data.player_id)
      .maybeSingle();

    const payload: any = {
      player_id: data.player_id,
      primary_position: data.primary_position ?? "undefined",
      height_cm: data.height_cm ?? null,
      notes: data.notes ?? null,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    };

    for (const k of SKILL_KEYS) {
      const val = (data as any)[k];
      payload[k] = (typeof val === 'number') ? val : null;
    }

    const { data: row, error } = await (sb as any)
      .from("player_skills")
      .upsert(payload, { onConflict: "player_id" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await (sb as any).from("admin_actions_log").insert({
      admin_user_id: uid,
      action: "player_skills_upsert",
      target_type: "player",
      target_id: data.player_id,
      details: { previous: previous ?? null, next: payload },
    });

    return { ok: true, skills: row };
  });

export const admin_clear_player_skills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ player_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    const { data: previous } = await (sb as any)
      .from("player_skills")
      .select("*")
      .eq("player_id", data.player_id)
      .maybeSingle();
    const { error } = await (sb as any)
      .from("player_skills")
      .delete()
      .eq("player_id", data.player_id);
    if (error) throw new Error(error.message);
    await (sb as any).from("admin_actions_log").insert({
      admin_user_id: uid,
      action: "player_skills_clear",
      target_type: "player",
      target_id: data.player_id,
      details: { previous: previous ?? null },
    });
    return { ok: true };
  });

/** Habilidades de um conjunto de jogadores (usado na distribuição de times). */
export const admin_get_skills_for_players = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) =>
    z.object({ player_ids: z.array(z.string().uuid()).max(200) }).parse(r),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.player_ids.length === 0) return { skills: [] as any[] };
    const sb = await admin();
    const { data: rows, error } = await (sb as any)
      .from("player_skills")
      .select("*")
      .in("player_id", data.player_ids);
    if (error) throw new Error(error.message);
    return { skills: rows ?? [] };
  });

const listPlayersToReviewSchema = z.object({
  search: z.string().optional().default(""),
  status: z.enum(["active", "inactive", "all"]).optional().default("active"),
  access_filter: z.string().optional().default("all"),
  sort: z.string().optional().default("name_asc"),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(50),
});

export const admin_list_players_to_review = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => listPlayersToReviewSchema.parse(r ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    // Obter IDs dos grupos
    const { data: groups } = await sb.from('groups').select('id, slug, name').order('sort_order');
    const tGroup = groups?.find(g => g.slug === 'terca' || g.name.toLowerCase().includes('terça'));
    const wGroup = groups?.find(g => g.slug === 'quarta' || g.name.toLowerCase().includes('quarta'));
    const thGroup = groups?.find(g => g.slug === 'quinta' || g.name.toLowerCase().includes('quinta'));
    const sGroup = groups?.find(g => g.slug === 'sabado' || g.name.toLowerCase().includes('sábado'));

    let query = sb
      .from("players")
      .select(`
        id, 
        name, 
        phone_normalized, 
        created_at, 
        active,
        player_groups(group_id, status)
      `, { count: 'exact' });

    if (data.status === 'active') {
      query = query.eq('active', true);
    } else if (data.status === 'inactive') {
      query = query.eq('active', false);
    } else {
      // Por padrão, se não especificado ou se algo deu errado, mostramos apenas ativos
      // na aba de revisão de acessos para evitar poluição.
      query = query.eq('active', true);
    }

    if (data.search) {
      const s = data.search.trim();
      const digits = s.replace(/[^0-9]/g, "");
      if (digits.length >= 8) {
        query = query.or(`name.ilike.%${s}%,phone_normalized.ilike.%${digits}%`);
      } else {
        query = query.ilike('name', `%${s}%`);
      }
    }

    // Ordenação
    if (data.sort === 'name_asc') query = query.order('name', { ascending: true });
    else if (data.sort === 'name_desc') query = query.order('name', { ascending: false });
    else if (data.sort === 'date_desc') query = query.order('created_at', { ascending: false });
    else if (data.sort === 'date_asc') query = query.order('created_at', { ascending: true });

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    
    const { data: rows, count, error } = await query.range(from, to);
    if (error) throw new Error(error.message);

    const items = (rows ?? []).map((p: any) => {
      const pgs = p.player_groups ?? [];
      const t = pgs.find((g: any) => g.group_id === tGroup?.id);
      const w = pgs.find((g: any) => g.group_id === wGroup?.id);
      const th = pgs.find((g: any) => g.group_id === thGroup?.id);
      const sa = pgs.find((g: any) => g.group_id === sGroup?.id);

      const approvedCount = pgs.filter((g: any) => g.status === 'approved').length;
      const pending = pgs.some((g: any) => g.status === 'pending');

      return {
        id: p.id,
        player_id: p.id,
        name: p.name,
        phone_normalized: p.phone_normalized,
        created_at: p.created_at,
        active: p.active,
        tuesday_status: t?.status ?? 'none',
        wednesday_status: w?.status ?? 'none',
        thursday_status: th?.status ?? 'none',
        saturday_status: sa?.status ?? 'none',
        total_approved_groups: approvedCount,
        has_pending_request: pending,
        total_count: count
      };
    });

    // Filtro de acesso (aplicado em memória se necessário, mas idealmente no banco)
    // Para simplificar e garantir 100% de precisão nos contadores e paginação com filtros complexos, 
    // em um cenário real faríamos mais lógica no banco. Aqui vamos filtrar o resultado se o filtro for específico.
    let filteredItems = items;
    if (data.access_filter !== 'all') {
      filteredItems = items.filter(pa => {
        if (data.access_filter === 'no_access') return pa.total_approved_groups === 0;
        if (data.access_filter === 'pending') return pa.has_pending_request;
        if (data.access_filter === 'has_access') return pa.total_approved_groups > 0;
        return true;
      });
    }

    return { 
      items: filteredItems, 
      total: count ?? 0,
      groups: {
        tuesday: tGroup?.id,
        wednesday: wGroup?.id,
        thursday: thGroup?.id,
        saturday: sGroup?.id
      }
    };
  });

const saveReviewedSchema = z.object({
  player_id: z.string().uuid().optional(),
  player_ids: z.array(z.string().uuid()).optional(),
  group_id: z.string().uuid().optional(),
  group_ids: z.array(z.string().uuid()).optional(),
  action: z.enum(["approve", "remove"]).optional().default("approve"),
});

export const admin_save_reviewed_accesses_v2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => saveReviewedSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    const pIds = data.player_ids ?? (data.player_id ? [data.player_id] : []);
    const gIds = data.group_ids ?? (data.group_id ? [data.group_id] : []);

    if (pIds.length === 0 || gIds.length === 0) {
      throw new Error("Selecione pelo menos um jogador e uma turma.");
    }

    const { error } = await (sb as any).rpc("admin_save_reviewed_accesses_v2", {
      p_player_ids: pIds,
      p_group_ids: gIds,
      p_action: data.action,
      p_admin_id: context.userId,
    });
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const admin_save_reviewed_accesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (r: unknown) =>
      z
        .object({
          player_ids: z.array(z.string().uuid()),
          group_ids: z.array(z.string().uuid()),
        })
        .parse(r),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await (sb as any).rpc("admin_save_reviewed_accesses", {
      p_player_ids: data.player_ids,
      p_group_ids: data.group_ids,
      p_admin_id: context.userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true };


  });

export const admin_update_settings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => updateSettingsSchema.parse(r))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();

    console.log("[server] admin_update_settings - data received:", JSON.stringify(data, null, 2));

    const groupUpdate: any = {};
    if (data.name !== undefined) groupUpdate.name = data.name;
    if (data.active !== undefined) groupUpdate.active = data.active;

    if (Object.keys(groupUpdate).length > 0) {
      console.log("[server] updating groups table:", groupUpdate);
      const { error } = await sb
        .from("groups")
        .update(groupUpdate)
        .eq("id", data.group_id);
      if (error) {
        console.error("[server] error updating groups:", error);
        throw new Error(`Erro ao atualizar grupo: ${error.message}`);
      }
    }

    const settingsUpdate: any = { group_id: data.group_id };
    
    if (data.open_weekday !== undefined) settingsUpdate.open_weekday = data.open_weekday;
    if (data.open_time !== undefined) {
      settingsUpdate.open_time = data.open_time;
      settingsUpdate.list_open_time = data.open_time;
    }
    if (data.priority_minutes !== undefined) settingsUpdate.priority_minutes = Number(data.priority_minutes);
    if (data.deadline_weekday !== undefined) settingsUpdate.withdrawal_deadline_weekday = Number(data.deadline_weekday);
    if (data.deadline_time !== undefined) settingsUpdate.withdrawal_deadline_time = data.deadline_time;
    
    // Mapeamento correto para a tabela app_settings
    if (data.max_players !== undefined) settingsUpdate.main_limit = Number(data.max_players);
    else if (data.main_limit !== undefined) settingsUpdate.main_limit = Number(data.main_limit);
    
    if (data.access_restriction_active !== undefined) settingsUpdate.access_restriction_active = Boolean(data.access_restriction_active);
    if (data.auto_promote !== undefined) settingsUpdate.auto_promote_reservations = Boolean(data.auto_promote);
    if (data.auto_generate_incidents !== undefined) settingsUpdate.auto_generate_incidents = Boolean(data.auto_generate_incidents);
    if (data.announcement !== undefined) settingsUpdate.announcement = data.announcement;
    if (data.convidados_habilitados !== undefined) settingsUpdate.convidados_habilitados = Boolean(data.convidados_habilitados);
    if (data.dia_liberacao_convidado !== undefined) settingsUpdate.dia_liberacao_convidado = data.dia_liberacao_convidado === null ? null : Number(data.dia_liberacao_convidado);
    if (data.hora_liberacao_convidado !== undefined) settingsUpdate.hora_liberacao_convidado = data.hora_liberacao_convidado;
    if (data.limite_convidados_por_usuario !== undefined) settingsUpdate.limite_convidados_por_usuario = Number(data.limite_convidados_por_usuario ?? 1);


    console.log("[server] app_settings upsert payload:", JSON.stringify(settingsUpdate, null, 2));

    // Se houver campos de settings para atualizar, faz o upsert
    if (Object.keys(settingsUpdate).length > 1) {
      const { data: upserted, error } = await sb
        .from("app_settings")
        .upsert(settingsUpdate, { onConflict: 'group_id' })
        .select()
        .single();
      
      if (error) {
        console.error("[server] error upserting app_settings:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Erro no banco (app_settings): ${error.message}`);
      }
      console.log("[server] app_settings upserted successfully");

      // Notificar mudança de aviso se houver
      if (settingsUpdate.announcement) {
        try {
          const { internalCreateNotification } = await import("./notifications.functions");
          
          // Buscar nome do grupo para o metadata
          const { data: groupData } = await sb
            .from("groups")
            .select("name")
            .eq("slug", data.group_id)
            .single();
          
          const groupName = groupData?.name || "sua turma";

          // Notificar todos os jogadores aprovados na turma
          const { data: players } = await sb
            .from("player_groups")
            .select("player_id")
            .eq("group_id", data.group_id)
            .eq("status", "approved");

          if (players) {
            for (const p of players) {
              await internalCreateNotification({
                player_id: p.player_id,
                type: 'organization_announcement',
                group_id: data.group_id,
                metadata: { 
                  message: settingsUpdate.announcement,
                  turma: groupName 
                },
                idempotency_key: `announcement-${p.player_id}-${data.group_id}-${Buffer.from(settingsUpdate.announcement).toString('base64').slice(0, 32)}`
              });
            }
          }
        } catch (e) {
          console.error("[NOTIFICATIONS] Error sending announcement:", e);
        }
      }

      return { ok: true, data: upserted };

    }
    return { ok: true };
  });




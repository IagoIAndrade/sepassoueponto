import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  if (!context.userId) throw new Error("not_authenticated");
  const { data } = await context.supabase.rpc("current_user_has_role", { _role: "admin" });
  if (!data) throw new Error("not_authorized");
  return context.userId;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const admin_update_player_primary_position = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    player_id: z.string().uuid(),
    primary_position: z.string().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    console.log(`[ADMIN POSITION] player_id: ${data.player_id}, nova posição: ${data.primary_position}`);
    
    // Upsert em player_skills para garantir que o registro exista
    const { data: res, error } = await sb
      .from("player_skills")
      .upsert({ 
        player_id: data.player_id, 
        primary_position: data.primary_position || 'undefined',
        updated_at: new Date().toISOString()
      }, { onConflict: 'player_id' })
      .select('primary_position')
      .single();

    if (error) {
      console.error("[ADMIN POSITION] ERRO:", error);
      throw new Error(error.message);
    }

    console.log("[ADMIN POSITION] resultado do servidor:", res);
    return { ok: true, primary_position: res.primary_position };
  });

export const admin_update_player_details = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    player_id: z.string().uuid(),
    name: z.string().trim().min(2).optional(),
    phone: z.string().trim().optional(),
    is_admin: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const update: any = {};
    if (data.name) update.name = data.name;
    if (data.phone) {
        const { normalizePhone } = await import("./utils");
        update.phone_normalized = normalizePhone(data.phone);
    }
    
    if (Object.keys(update).length > 0) {
        const { error } = await sb.from("players").update(update).eq("id", data.player_id);
        if (error) throw new Error(error.message);
    }

    if (data.is_admin !== undefined) {
        if (data.is_admin) {
            await sb.from("user_roles").upsert({ user_id: data.player_id, role: 'admin' }, { onConflict: 'user_id,role' });
        } else {
            await sb.from("user_roles").delete().match({ user_id: data.player_id, role: 'admin' });
        }
    }
    return { ok: true };
  });

export const admin_get_organizers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    const { data: organizers, error } = await sb
      .from("player_groups")
      .select(`
        player_id,
        is_organizer,
        organizer_order,
        players (
          id,
          name,
          phone_normalized,
          avatar_path
        )
      `)
      .eq("group_id", data.group_id)
      .eq("is_organizer", true)
      .order("organizer_order", { ascending: true });

    if (error) throw new Error(error.message);
    return { organizers: organizers || [] };
  });

export const admin_list_eligible_organizers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ group_id: z.string().uuid(), search: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    // Busca TODOS os jogadores ativos (global)
    let query = sb
      .from("players")
      .select(`
        id,
        name,
        phone_normalized,
        avatar_path
      `)
      .eq("active", true);

    if (data.search) {
      const s = data.search.trim();
      if (s) {
        query = query.or(`name.ilike.%${s}%,phone_normalized.ilike.%${s}%`);
      }
    }

    const { data: allPlayers, error: pError } = await query.limit(50);
    if (pError) throw new Error(pError.message);

    // Busca vínculos e quem já é organizador nesta turma
    const { data: existing, error: eError } = await sb
      .from("player_groups")
      .select("player_id, status, is_organizer")
      .eq("group_id", data.group_id);
    
    if (eError) throw new Error(eError.message);

    const existingMap = new Map((existing || []).map(e => [e.player_id, e]));

    // Filtra quem já é organizador e mapeia o status do vínculo
    const result = (allPlayers || [])
      .filter(p => !existingMap.get(p.id)?.is_organizer)
      .map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone_normalized,
        avatar_url: p.avatar_path,
        group_status: existingMap.get(p.id)?.status || "none"
      }));

    return { players: result };
  });

export const admin_set_organizer_status = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ 
    player_id: z.string().uuid(), 
    group_id: z.string().uuid(), 
    is_organizer: z.boolean(),
    order: z.number().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    if (data.is_organizer) {
      const { error: upsertError } = await sb
        .from("player_groups")
        .upsert({ 
          player_id: data.player_id, 
          group_id: data.group_id, 
          status: 'approved',
          is_organizer: true,
          organizer_order: data.order ?? 99
        }, { onConflict: 'player_id,group_id', ignoreDuplicates: false });
      
      if (upsertError) throw new Error(upsertError.message);
    } else {
      const { error } = await sb
        .from("player_groups")
        .update({ 
          is_organizer: false,
          organizer_order: null
        })
        .match({ player_id: data.player_id, group_id: data.group_id });

      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const admin_reorder_organizers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    group_id: z.string().uuid(),
    orders: z.array(z.object({
      player_id: z.string().uuid(),
      order: z.number()
    }))
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    for (const item of data.orders) {
      await sb
        .from("player_groups")
        .update({ organizer_order: item.order })
        .match({ player_id: item.player_id, group_id: data.group_id });
    }
    
    return { ok: true };
  });

export const admin_auto_enroll_organizers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ 
    group_id: z.string().uuid().or(z.literal("")),
    event_id: z.string().uuid().optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    // 1. Buscar a rodada
    let eventId = data.event_id;
    if (!eventId && data.group_id) {
      const { data: event } = await sb
        .from("volleyball_events")
        .select("id")
        .eq("group_id", data.group_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      eventId = event?.id;
    }

    if (!eventId) return { ok: false, message: "Nenhuma rodada encontrada para processar organizadores" };

    // 2. Executar a RPC de autoinscrição atômica e determinística
    console.log(`[AUTO ORGANIZERS] Iniciando garantia de organizadores para evento: ${eventId}`);
    const { data: res, error } = await sb.rpc("admin_ensure_opening_organizers", {
      p_event_id: eventId,
      p_admin_user_id: context.userId
    });

    if (error) {
      console.error("[AUTO ORGANIZERS] Erro na RPC:", error);
      throw new Error(error.message);
    }

    const result = (Array.isArray(res) ? res[0] : res) as any;
    if (!result) return { ok: false, message: "Erro ao processar resultado da sincronização" };

    console.log(`[AUTO ORGANIZERS] Finalizado. Detalhes:`, JSON.stringify(result.details));

    return { 
      ok: true, 
      enrolled: result.enrolled_count || 0, 
      already: result.already_enrolled_count || 0,
      message: `Organizadores sincronizados: ${result.enrolled_count || 0} adicionados • ${result.already_enrolled_count || 0} já estavam na lista`
    };
  });

export const admin_move_registration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    registration_id: z.string().uuid(),
    new_position: z.number().int().positive()
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    
    // Usamos o RPC admin_move existente que já trata os deslocamentos e logs
    const { error } = await sb.rpc("admin_move", {
      p_registration_id: data.registration_id,
      p_new_list: 'main',
      p_new_position: data.new_position,
      p_admin_user_id: context.userId
    });
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });



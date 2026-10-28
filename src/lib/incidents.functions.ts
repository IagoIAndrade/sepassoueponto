import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

const createIncidentSchema = z.object({
  player_id: z.string().uuid(),
  event_id: z.string().uuid(),
  incident_type: z.enum(["no_show", "late_leave"]),
  occurred_at: z.string(),
  suggested_rounds: z.number().int().min(1),
  status: z.enum(["pending", "applied", "justified", "cancelled", "completed"]),
  admin_notes: z.string().optional(),
  group_id: z.string().uuid().optional(),
});

export const admin_create_incident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createIncidentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    type IncidentInsert = Database['public']['Tables']['player_incidents']['Insert'];
    const insertData: IncidentInsert = {
      player_id: data.player_id,
      event_id: data.event_id,
      incident_type: data.incident_type,
      occurred_at: data.occurred_at,
      suggested_rounds: data.suggested_rounds,
      status: data.status,
      admin_notes: data.admin_notes ?? null,
      group_id: data.group_id ?? null
    };
    const { data: res, error } = await sb
      .from("player_incidents")
      .insert(insertData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res;
  });

export const admin_delete_incident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ incident_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.from("player_incidents").delete().eq("id", data.incident_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const admin_apply_incident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ incident_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    type IncidentUpdate = Database['public']['Tables']['player_incidents']['Update'];
    const updateData: IncidentUpdate = {
      status: "applied",
      decided_at: new Date().toISOString()
    };
    const { error } = await sb.from("player_incidents").update(updateData).eq("id", data.incident_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const admin_resolve_incident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ incident_id: z.string().uuid(), status: z.enum(["pending", "applied", "justified", "cancelled", "completed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    type IncidentUpdate = Database['public']['Tables']['player_incidents']['Update'];
    const updateData: IncidentUpdate = {
      status: data.status,
      decided_at: new Date().toISOString()
    };
    const { error } = await sb.from("player_incidents").update(updateData).eq("id", data.incident_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const admin_get_incidents_metrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: res, error } = await sb.rpc("get_incidents_with_metrics", { p_group_id: data.group_id });
    if (error) throw new Error(error.message);
    return { incidents: res };
  });

export const admin_list_active_blocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: res, error } = await sb.rpc("get_incidents_with_metrics", { p_group_id: data.group_id });
    if (error) throw new Error(error.message);
    const active = (res || []).filter((i: any) => i.status === 'applied');
    return { blocks: active };
  });

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// Lista ocorrências filtrando pela DATA DO JOGO (volleyball_events.event_date),
// incluindo rodadas encerradas e histórico completo.
export const admin_list_incidents_by_game = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        group_id: z.string().uuid().optional().nullable(),
        start_date: z.string().regex(dateRe).optional().nullable(),
        end_date: z.string().regex(dateRe).optional().nullable(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb: any = await admin();
    let q = sb
      .from("player_incidents")
      .select(
        `*,
        players!player_incidents_player_id_fkey ( name, phone, avatar_path ),
        volleyball_events!player_incidents_event_id_fkey!inner ( id, event_date, status ),
        groups!player_incidents_group_id_fkey ( id, name )`,
      );
    if (data.group_id) q = q.eq("group_id", data.group_id);
    if (data.start_date) q = q.gte("volleyball_events.event_date", data.start_date);
    if (data.end_date) q = q.lte("volleyball_events.event_date", data.end_date);
    const { data: rows, error } = await q.order("occurred_at", { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);

    const { data: done, error: e2 } = await sb
      .from("volleyball_events")
      .select("group_id, created_at")
      .eq("status", "completed");
    if (e2) throw new Error(e2.message);

    const incidents = (rows || []).map((r: any) => {
      const fulfilled = r.applied_at
        ? (done || []).filter((e: any) => e.group_id === r.group_id && e.created_at > r.applied_at).length
        : 0;
      return {
        incident_id: r.id,
        player_id: r.player_id,
        player_name: r.players?.name ?? "",
        avatar_path: r.players?.avatar_path ?? null,
        phone: r.players?.phone ?? null,
        incident_type: r.incident_type,
        occurred_at: r.occurred_at,
        suggested_rounds: r.suggested_rounds,
        applied_rounds: r.applied_rounds,
        admin_notes: r.admin_notes,
        withdrawal_note: r.withdrawal_note ?? null,
        status: r.status,
        applied_at: r.applied_at ?? null,
        fulfilled_rounds: fulfilled,
        remaining_rounds: Math.max(0, (r.suggested_rounds || 0) - fulfilled),
        event_id: r.event_id,
        event_date: r.volleyball_events?.event_date ?? null,
        event_status: r.volleyball_events?.status ?? null,
        group_id: r.group_id,
        group_name: r.groups?.name ?? null,
      };
    });
    const rank = (s: string) => (s === "pending" ? 1 : s === "applied" ? 2 : 3);
    incidents.sort((a: any, b: any) => rank(a.status) - rank(b.status) || (b.event_date || "").localeCompare(a.event_date || "") || b.occurred_at.localeCompare(a.occurred_at));
    return { incidents };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveAttendanceSchema = z.object({
  event_id: z.string().uuid(),
  attendances: z.array(z.object({
    registration_id: z.string().uuid(),
    status: z.enum(["present", "absent", "unverified"])
  }))
});

export const admin_get_frequency_stats_fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({
    group_id: z.string().uuid().nullable().optional(),
    search: z.string().nullable().optional(),
    page: z.number().default(1),
    limit: z.number().default(50),
    recent_limit: z.number().default(14),
    attention_limit: z.number().default(29),
    status_filter: z.string().default("all"),
    sort_by: z.string().default("days_desc")
  }).parse(r))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_get_frequency_stats", {
      p_group_id: data.group_id ?? undefined,
      p_search: data.search ?? undefined,
      p_page: data.page,
      p_limit: data.limit,
      p_recent_limit: data.recent_limit,
      p_attention_limit: data.attention_limit,
      p_status_filter: data.status_filter,
      p_sort_by: data.sort_by
    });

    // Captura detalhes internos do erro do Supabase
    if (error) {
      throw new Error(JSON.stringify({
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        stage: "rpc_admin_get_frequency_stats"
      }));
    }
    
    if (!result || typeof result !== "object") {
        return { players: [], total: 0, first_recorded_date: null };
    }
    const resObj = result as Record<string, unknown>;
    return {
        players: Array.isArray(resObj.players) ? (resObj.players as any[]) : [],
        total: typeof resObj.total === "number" ? resObj.total : 0,
        first_recorded_date: typeof resObj.first_recorded_date === "string" ? resObj.first_recorded_date : null
    };
  });

export const admin_get_player_attendance_history_fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => z.object({ player_id: z.string().uuid() }).parse(r))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_get_player_attendance_history", {
      p_player_id: data.player_id
    });
    if (error) throw new Error(error.message);
    return (result ?? []) as any[];
  });

export const admin_save_attendance_fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((r: unknown) => saveAttendanceSchema.parse(r))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_save_attendance", {
      p_event_id: data.event_id,
      p_attendances: data.attendances as any
    });

    if (error) throw new Error(error.message);
    return result ?? { ok: true, processed: 0 };
  });

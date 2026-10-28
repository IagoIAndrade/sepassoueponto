
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const myHistorySchema = z.object({
  limit: z.number().optional().default(30),
});

export const get_my_history = createServerFn({ method: "GET" })
  .validator((raw: unknown) => myHistorySchema.parse(raw))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const token = readSessionCookie();
    if (!token) return { registrations: [] };
    
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pid, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });
    if (sErr || !pid) return { registrations: [] };

    // Buscar histórico do jogador via RPC segura
    const { data: rows, error } = await (supabaseAdmin as any).rpc("internal_get_my_full_history", {
      p_player_id: pid,
      p_limit: data.limit
    });

    if (error) throw new Error(error.message);

    const historyRows = (rows || []) as any[];

    return { 
      player_id: pid,
      registrations: historyRows.map((r: any) => ({
        id: r.id,
        list_type: r.list_type,
        position_number: r.position_number,
        created_at: r.created_at,
        cancelled_at: r.cancelled_at,
        event_id: r.event_id,
        event_date: r.event_date,
        event_status: r.event_status,
        event_time: r.start_time,
        group_name: r.group_name,
        main_limit: r.main_limit,
        player_id: r.player_id ?? pid,
        player_name: r.player_name,
        primary_position: r.primary_position ?? r.player_primary_position ?? null
      }))
    };
  });

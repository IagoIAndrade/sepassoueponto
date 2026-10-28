import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const admin_list_withdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        group_id: z.string().uuid().optional().nullable(),
        event_id: z.string().uuid().optional(),
        start_date: z.string().regex(dateRe).optional().nullable(),
        end_date: z.string().regex(dateRe).optional().nullable(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = (supabaseAdmin as any)
      .from("registration_withdrawals")
      .select(
        `*,
        volleyball_events!registration_withdrawals_event_id_fkey!inner ( id, event_date, status ),
        groups!registration_withdrawals_group_id_fkey ( id, name )`,
      );

    if (data.group_id) query = query.eq("group_id", data.group_id);
    if (data.event_id) query = query.eq("event_id", data.event_id);
    if (data.start_date) query = query.gte("volleyball_events.event_date", data.start_date);
    if (data.end_date) query = query.lte("volleyball_events.event_date", data.end_date);

    const { data: rows, error } = await query.order("removed_at", { ascending: false }).limit(1000);
    if (error) {
      console.error("[WITHDRAWALS_SERVER] Error:", error);
      throw new Error(error.message);
    }
    const raw = (rows || []) as any[];

    // Somente executores jogadores são resolvidos por nome (ID gravado pelo backend a partir da sessão).
    const playerIds = Array.from(
      new Set(raw.map((w) => w.removed_by_player_id).filter(Boolean)),
    ) as string[];
    const names: Record<string, string> = {};
    if (playerIds.length) {
      const { data: ps } = await supabaseAdmin
        .from("players")
        .select("id, name, first_name, last_name")
        .in("id", playerIds);
      (ps || []).forEach((p: any) => {
        const n = (p.first_name ? `${p.first_name} ${p.last_name || ""}` : p.name || "").trim();
        if (n) names[p.id] = n;
      });
    }

    const withdrawals = raw.map((w) => {
      let origin = "Não identificada";
      let author = "Autor não identificado";
      const src = String(w.removal_source || "").toLowerCase();
      if (src === "system") {
        origin = "Sistema";
        author = "Sistema";
      } else if (src === "admin" || src === "admin_remove") {
        origin = "Administrador";
        author = w.removed_by_admin_user_id ? "Administrador" : "Autor não identificado";
      } else if (src === "player") {
        const n = w.removed_by_player_id ? names[w.removed_by_player_id] : undefined;
        if (n && w.removed_by_player_id === w.player_id) {
          origin = "Próprio jogador";
          author = n;
        } else if (n) {
          origin = "Outro jogador";
          author = n;
        } else {
          origin = "Jogador";
        }
      }
      return {
        ...w,
        event_date: w.volleyball_events?.event_date ?? null,
        group_name: w.groups?.name ?? null,
        origin_label: origin,
        author_label: author,
      };
    });

    return { withdrawals };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const get_my_group_accesses = createServerFn({ method: "GET" }).handler(async () => {
  const { readSessionCookie } = await import("./player-session.server");
  const token = readSessionCookie();
  
  if (!token) return { accesses: [] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // 1. Validar sessão para obter o player_id
  const { data: pid, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
    p_token: token,
  });

  if (vErr || !pid) {
    console.error("[ACCESS AUDIT] get_my_group_accesses - Session invalid", vErr);
    return { accesses: [] };
  }

  // 2. Buscar acessos diretamente via player_id usando supabaseAdmin (ignora RLS)
  const { data: rows, error } = await supabaseAdmin
    .from("player_groups")
    .select("group_id, groups(name), status, rejection_reason, has_priority, processed_at")
    .eq("player_id", pid);

  const { data: player } = await supabaseAdmin
    .from("players")
    .select("has_global_priority")
    .eq("id", pid)
    .maybeSingle();

  if (error) {
    console.error("[ACCESS AUDIT] Error fetching player_groups:", error);
    throw new Error(error.message);
  }

  // 3. Formatar para manter compatibilidade com a interface esperada
  // Buscar hora do servidor para contagem regressiva precisa
  let serverNowIso: string | null = null;
  try {
    const { data: nowRes } = await supabaseAdmin.rpc("get_server_now" as any);
    if (typeof nowRes === "string") serverNowIso = nowRes;
  } catch { /* fallback below */ }
  if (!serverNowIso) {
    serverNowIso = new Date().toISOString();
  }

  const formatted = (rows ?? []).map((r: any) => ({
    group_id: r.group_id,
    group_name: r.groups?.name || "Turma",
    status: r.status,
    rejection_reason: r.rejection_reason,
    has_priority: r.has_priority === true,
    processed_at: r.processed_at || null,
  }));
  
  console.log("[ACCESS AUDIT] get_my_group_accesses (Fixed) response:", { 
    count: formatted.length,
    pid,
    firstStatus: formatted[0]?.status,
    has_global_priority: player?.has_global_priority
  });
  
  return { accesses: formatted, has_global_priority: player?.has_global_priority === true, server_now: serverNowIso };
});

export const player_request_group_access = createServerFn({ method: "POST" })
  .validator((r: unknown) => z.object({ group_id: z.string().uuid() }).parse(r))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const token = readSessionCookie();
    if (!token) throw new Error("not_authenticated");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("player_request_group_access", {
      p_token: token,
      p_group_id: data.group_id,
    });

    if (error) {
      // Parse cooldown error from backend: "cooldown_active::2026-09-21T14:30:00+00"
      const msg = error.message || "";
      if (msg.startsWith("cooldown_active::")) {
        const rejectedAt = msg.replace("cooldown_active::", "").trim();
        throw new Error(`cooldown_active::${rejectedAt}`);
      }
      throw new Error(msg);
    }
    return { ok: true };
  });

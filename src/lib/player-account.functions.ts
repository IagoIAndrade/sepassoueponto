import { createServerFn } from "@tanstack/react-start";

export const delete_my_player_account = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readSessionCookie, clearSessionCookie } = await import("./player-session.server");
    const token = readSessionCookie();
    if (!token) throw new Error("not_authenticated");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: pid, error: sErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });
    
    if (sErr || !pid) {
      clearSessionCookie();
      throw new Error("invalid_session");
    }

    const { error: dErr } = await (supabaseAdmin as any).rpc("internal_delete_player_self", {
      p_player_id: pid
    });

    if (dErr) throw new Error(dErr.message);

    clearSessionCookie();
    
    return { ok: true };
  });


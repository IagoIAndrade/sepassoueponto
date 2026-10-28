import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * admin_revoke_all_sessions_fn
 *
 * Revoga TODAS as sessões ativas de um jogador.
 *
 * Segurança:
 * - `requireSupabaseAuth` valida o token do Supabase e injeta `userId`/`supabase`.
 * - O UUID do administrador NÃO vem do body — vem do token validado.
 * - Só p_target_player_id é aceito do body.
 * - A RPC `admin_revoke_all_sessions` no banco também verifica `has_role('admin')`
 *   internamente via `auth.uid()` (defesa em profundidade).
 */
export const admin_revoke_all_sessions_fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z.object({ p_target_player_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    // Verificação explícita do papel do chamador (defesa em profundidade;
    // a RPC também rechecha via auth.uid()).
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "current_user_has_role",
      { _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("not_authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: revoked, error } = await supabaseAdmin.rpc("admin_revoke_all_sessions", {
      p_target_player_id: data.p_target_player_id,
    });
    if (error) throw new Error(error.message);
    return { revoked_count: revoked ?? 0 };
  });

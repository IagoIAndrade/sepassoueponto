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

const addPaymentSchema = z.object({
  fund_id: z.string().uuid(),
  participant_id: z.string().uuid(),
  amount: z.number().positive(),
  paid_at: z.string(),
  notes: z.string().optional(),
});

export const admin_add_fund_payment_direct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => addPaymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const uid = await assertAdmin(context);
    const sb = await admin();
    
    // admin_add_fund_payment existe no banco mas às vezes dá erro de parâmetro
    // Vamos usar o RPC original do commit b031913
    const { data: res, error } = await context.supabase.rpc("admin_add_fund_payment", {
      p_fund_id: data.fund_id,
      p_participant_id: data.participant_id,
      p_payer_name: null,
      p_amount: data.amount,
      p_paid_at: data.paid_at,
      p_payment_method: 'admin',
      p_notes: data.notes || null,
    } as any);

    if (error) throw new Error(error.message);
    return res;
  });

export const admin_set_participant_notes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ participant_id: z.string().uuid(), notes: z.string().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.from("fund_participants").update({ notes: data.notes }).eq("id", data.participant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

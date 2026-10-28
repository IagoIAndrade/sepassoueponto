import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type NotificationType = 
  | 'registration_opened'
  | 'registration_confirmed'
  | 'waitlist_joined'
  | 'promoted_to_main'
  | 'teams_published'
  | 'event_changed'
  | 'event_cancelled'
  | 'organization_announcement'
  | 'withdrawal_deadline'
  | 'payment_pending'
  | 'access_approved';

export interface AppNotification {
  id: string;
  player_id: string;
  type: NotificationType;
  group_id: string | null;
  event_id: string | null;
  metadata: any;
  created_at: string;
  read_at: string | null;
}

/**
 * Busca as últimas 30 notificações do jogador logado.
 */
export const getMyNotifications = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    if (!token) return { notifications: [] };

    const { data: userId, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (vErr || !userId) return { notifications: [] };

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('player_id', userId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error("[NOTIFICATIONS] Error fetching:", error);
      return { notifications: [] };
    }

    return { notifications: (data || []) as AppNotification[] };
  });

/**
 * Marca uma notificação específica como lida.
 */
export const markNotificationAsRead = createServerFn({ method: "POST" })
  .validator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    if (!token) throw new Error("Unauthorized");

    const { data: userId, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (vErr || !userId) throw new Error("Unauthorized");

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('player_id', userId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Marca todas as notificações do jogador como lidas.
 */
export const markAllNotificationsAsRead = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    if (!token) throw new Error("Unauthorized");

    const { data: userId, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (vErr || !userId) throw new Error("Unauthorized");

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('player_id', userId)
      .is('read_at', null);

    if (error) throw error;
    return { success: true };
  });

/**
 * Função interna (Server-Only) para criar notificações.
 */
export async function internalCreateNotification(payload: {
  player_id: string;
  type: NotificationType;
  group_id?: string | null;
  event_id?: string | null;
  metadata?: any;
  idempotency_key?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({
      player_id: payload.player_id,
      type: payload.type as any,
      group_id: payload.group_id || null,
      event_id: payload.event_id || null,
      metadata: payload.metadata || {},
      idempotency_key: payload.idempotency_key || null
    });

  if (error) {
    // Silencia erros de chave duplicada (idempotência)
    if (error.code === '23505') return { success: true, duplicated: true };
    console.error("[NOTIFICATIONS] Error creating:", error);
    return { success: false, error };
  }

  return { success: true };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getMyPushPreferences = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = readSessionCookie();
    if (!token) return { preferences: null };
    const { data: userId } = await supabaseAdmin.rpc("internal_validate_session", { p_token: token });
    if (!userId) return { preferences: null };
    
    const { data } = await supabaseAdmin
      .from('player_push_preferences')
      .select('*')
      .eq('player_id', userId)
      .single();
      
    return { preferences: data || null };
  });

export const updateMyPushPreferences = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = readSessionCookie();
    if (!token) throw new Error("unauthorized");
    const { data: userId } = await supabaseAdmin.rpc("internal_validate_session", { p_token: token });
    if (!userId) throw new Error("unauthorized");

    const { error } = await supabaseAdmin
      .from('player_push_preferences')
      .upsert({
        player_id: userId,
        ...data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'player_id' });

    if (error) throw error;
    return { success: true };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .validator((data) => z.object({
    endpoint: z.string(),
    p256dh: z.string(),
    auth: z.string(),
    user_agent: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    console.log("[PUSH SERVER AUTH]", {
      tokenPresent: !!token,
      method: "savePushSubscription"
    });

    if (!token) throw new Error("unauthorized");

    const { data: userId, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (vErr || !userId) {
      console.error("[PUSH SERVER AUTH] Session validation failed:", vErr);
      throw new Error("unauthorized");
    }
    
    console.log("[PUSH SERVER AUTH] Session valid for player:", userId);

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        player_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.user_agent,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error("[PUSH] Error saving subscription:", error);
      throw error;
    }

    return { success: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .validator((data) => z.object({
    endpoint: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    console.log("[PUSH SERVER AUTH]", {
      tokenPresent: !!token,
      method: "removePushSubscription"
    });

    if (!token) throw new Error("unauthorized");

    const { data: userId, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (vErr || !userId) {
      console.error("[PUSH SERVER AUTH] Session validation failed:", vErr);
      throw new Error("unauthorized");
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', data.endpoint)
      .eq('player_id', userId);

    if (error) {
      console.error("[PUSH] Error removing subscription:", error);
      throw error;
    }

    return { success: true };
  });

export const getVapidPublicKey = createServerFn({ method: "GET" })
  .handler(async () => {
    const key = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
    if (!key) console.warn("[PUSH] VAPID_PUBLIC_KEY ausente no servidor.");
    return { publicKey: key || null };
  });

export const getMyPushSubscriptions = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readSessionCookie } = await import("./player-session.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const token = readSessionCookie();
    console.log("[PUSH SERVER AUTH]", {
      tokenPresent: !!token,
      method: "getMyPushSubscriptions"
    });

    if (!token) return { subscriptions: [] };

    const { data: userId, error: vErr } = await supabaseAdmin.rpc("internal_validate_session", {
      p_token: token,
    });

    if (vErr || !userId) {
      console.error("[PUSH SERVER AUTH] Session validation failed:", vErr);
      return { subscriptions: [] };
    }

    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('player_id', userId);

    if (error) {
      console.error("[PUSH] Error fetching subscriptions:", error);
      return { subscriptions: [] };
    }

    return { subscriptions: data || [] };
  });

/**
 * Server-only function to process a single outbox item.
 */
export async function processOutboxItem(outboxId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const webpush = (await import("web-push")).default;

  // 1. Get outbox item and notification
  const { data: outboxItem, error: outboxError } = await supabaseAdmin
    .from('push_notification_outbox')
    .select('*, notifications(*)')
    .eq('id', outboxId)
    .single();

  if (outboxError || !outboxItem) {
    console.error("[PUSH] Outbox item not found:", outboxId, outboxError);
    return;
  }

  const notification = outboxItem.notifications;
  if (!notification) {
    console.error("[PUSH] Notification not found for outbox:", outboxId);
    await supabaseAdmin
      .from('push_notification_outbox')
      .update({ status: 'failed', last_error: 'Notification missing' })
      .eq('id', outboxId);
    return;
  }

  const { data: prefs } = await supabaseAdmin
    .from('player_push_preferences')
    .select('*')
    .eq('player_id', outboxItem.player_id as string)
    .single();

  let shouldSend = true;
  if (prefs) {
    if (notification.type === 'registration_opened') {
      if (prefs.notify_registration_open === false) shouldSend = false;
      if (notification.group_id && Array.isArray(prefs.group_ids)) {
        if (!prefs.group_ids.includes(notification.group_id)) shouldSend = false;
      }
    } else if (notification.type === 'promoted_to_main') {
      if (prefs.notify_promoted === false) shouldSend = false;
    } else if (notification.type === 'event_changed' || notification.type === 'event_cancelled') {
      if (prefs.notify_event_changed === false) shouldSend = false;
    } else if (notification.type === 'access_approved' || notification.type === 'access_rejected') {
      if (prefs.notify_access_approved === false) shouldSend = false;
    } else if ((notification.type as string) === 'guest_release') {
      if (prefs.notify_guest_release === false) shouldSend = false;
    }
  }

  if (!shouldSend) {
    await supabaseAdmin
      .from('push_notification_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: 'Skipped by user preference' })
      .eq('id', outboxId);
    return;
  }

  // 2. Get user subscriptions
  const { data: subscriptions, error: subError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('player_id', outboxItem.player_id as string);

  if (subError || !subscriptions || subscriptions.length === 0) {
    await supabaseAdmin
      .from('push_notification_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', outboxId);
    return;
  }

  // 3. Configure VAPID
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY || process.env.VITE_VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    const err = "VAPID keys missing in environment";
    console.error("[PUSH]", err);
    await supabaseAdmin
      .from('push_notification_outbox')
      .update({ status: 'failed', last_error: err })
      .eq('id', outboxId);
    return;
  }

  webpush.setVapidDetails(
    'https://aplicacoes-sepassoueponto.4nki4e.easypanel.host',
    publicKey,
    privateKey
  );

  // 4. Prepare payload
  const metadata = (notification.metadata as any) || {};
  const turma = metadata.turma || 'sua turma';
  const data_ref = metadata.data ? ` do dia ${metadata.data}` : '';
  const data_hora = metadata.data_hora ? `\n${metadata.data_hora}` : '';

  const titleMap: Record<string, string> = {
    'access_approved': '✅ Acesso aprovado!',
    'access_rejected': '❌ Acesso recusado',
    'registration_opened': '🏐 Lista aberta!',
    'promoted_to_main': '🎉 Você conseguiu uma vaga!',
    'teams_published': '🏐 Times definidos!',
    'event_cancelled': '❌ Rodada cancelada',
    'organization_announcement': metadata.turma ? `📢 Aviso — ${metadata.turma}` : 'Aviso da Turma 📢'
  };

  const bodyMap: Record<string, string> = {
    'access_approved': `A organização respondeu à sua solicitação de acesso.`,
    'access_rejected': `Sua solicitação de acesso foi recusada.`,
    'registration_opened': `As inscrições de ${turma} estão abertas para ${metadata.data || 'a próxima rodada'}.${data_hora}`,
    'promoted_to_main': `Você saiu da reserva! Sua vaga na lista principal de ${turma}, em ${metadata.data || ''} às ${metadata.hora ? metadata.hora.replace(':', 'h') : ''}, foi confirmada.`,
    'teams_published': `Seu time para ${turma}${data_ref} já está disponível.`,
    'event_cancelled': `A rodada de ${turma}${data_ref} foi cancelada.`,
    'event_changed': `Houve uma alteração na rodada de ${turma} (${metadata.data || ''}). Confira os novos detalhes.`,
    'organization_announcement': metadata.message || 'Há um novo comunicado para você.'
  };

  const payload = JSON.stringify({
    title: titleMap[notification.type] || 'SE PASSOU, E PONTO 🏐',
    body: bodyMap[notification.type] || 'Você tem uma nova notificação.',
    data: {
      notification_id: notification.id,
      group_id: notification.group_id,
      event_id: notification.event_id,
      type: notification.type,
      destination: getDestination(notification.type)
    }
  });

  // 5. Send to all devices and track deliveries
  let successCount = 0;
  let failureMessage = '';

  const sendPromises = subscriptions.map(async (sub) => {
    try {
      // Check if already delivered for this outbox + subscription
      const { data: existing } = await supabaseAdmin
        .from('push_deliveries')
        .select('id')
        .eq('outbox_id', outboxId)
        .eq('subscription_id', sub.id)
        .eq('status', 'sent')
        .maybeSingle();
      
      if (existing) return;

      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        payload
      );

      successCount++;
      
      // Record delivery
      await supabaseAdmin
        .from('push_deliveries')
        .upsert({
          outbox_id: outboxId,
          subscription_id: sub.id,
          status: 'sent',
          sent_at: new Date().toISOString()
        }, { onConflict: 'outbox_id, subscription_id' });

    } catch (err: any) {
      console.error("[PUSH] Error sending to subscription:", sub.id, err.statusCode);
      failureMessage = err.message || 'Push service error';

      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or invalid - remove it
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id);
      } else {
        await supabaseAdmin
          .from('push_deliveries')
          .upsert({
            outbox_id: outboxId,
            subscription_id: sub.id,
            status: 'failed',
            error: failureMessage
          }, { onConflict: 'outbox_id, subscription_id' });
      }
    }
  });

  await Promise.allSettled(sendPromises);

  // 6. Update outbox status
  const finalStatus = successCount > 0 ? 'sent' : 'failed';
  await supabaseAdmin
    .from('push_notification_outbox')
    .update({ 
      status: finalStatus, 
      sent_at: successCount > 0 ? new Date().toISOString() : null,
      failed_at: successCount === 0 ? new Date().toISOString() : null,
      last_error: successCount === 0 ? failureMessage : null
    })
    .eq('id', outboxId);
}

/**
 * Legacy support for direct sending (not recommended, use outbox)
 */
export async function internalSendPushNotification(notificationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // Create outbox entry manually for tracking
  const { data: notif } = await supabaseAdmin
    .from('notifications')
    .select('player_id')
    .eq('id', notificationId)
    .single();
    
  if (!notif) return;

  const { data: outbox } = await supabaseAdmin
    .from('push_notification_outbox')
    .insert({
      notification_id: notificationId,
      player_id: notif.player_id,
      status: 'processing',
      processing_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (outbox && outbox.id) {
    await processOutboxItem(outbox.id);
  }
}

function getDestination(type: string) {
  if (type === 'teams_published') return 'times';
  if (type === 'registration_opened' || type === 'promoted_to_main') return 'lista';
  return 'inicio';
}

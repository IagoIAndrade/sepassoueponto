import { createFileRoute } from '@tanstack/react-router';
import { internalSendPushNotification } from '@/lib/push.functions';

export const Route = createFileRoute('/api/public/push-trigger')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Basic security check - could use a specific header if needed
          // For now, we trust the database webhook if configured correctly
          // but we will verify notification_id exists inside internalSendPushNotification
          
          const payload = await request.json();
          const { record, type, outbox_id } = payload;
          
          console.log('[PUSH-TRIGGER] Received webhook event:', type);

          if (type === 'INSERT' && record?.id) {
            // Fallback for direct Supabase Webhook on notifications table
            await internalSendPushNotification(record.id);
          } else if (type === 'OUTBOX_PROCESS' && outbox_id) {
            // Triggered by our PG function process_push_outbox
            const { processOutboxItem } = await import('@/lib/push.functions');
            await processOutboxItem(outbox_id);
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err: any) {
          console.error('[PUSH-TRIGGER] Error:', err);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
});

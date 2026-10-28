import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export function usePushNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE') {
        const url = event.data.url;
        console.log('[PUSH NAV] Received navigation request:', url);
        
        // Extract params from URL
        const urlObj = new URL(url, window.location.origin);
        const group = urlObj.searchParams.get('group');
        const eventId = urlObj.searchParams.get('event');
        const view = urlObj.searchParams.get('view');

        // Execute navigation
        navigate({
          to: '/',
          search: (prev: any) => ({
            ...prev,
            group: group || prev.group,
            event: eventId || prev.event,
            view: view || prev.view
          })
        });

        // If app is focused, we might want to suppress the system notification
        // but that's handled in the SW. Here we just give feedback.
        if (event.data.notification_id) {
          console.log('[PUSH NAV] App is open, navigation handled for notification:', event.data.notification_id);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [navigate]);
}

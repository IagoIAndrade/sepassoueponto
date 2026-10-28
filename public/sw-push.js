self.addEventListener('install', function(event) {
  console.log('[SW-PUSH] Install - Atualização sem perda de sessão');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW-PUSH] Activate - Operando cliente limpo');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
  console.log('[SW] Push Received:', event);

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    console.warn('[SW] Push data is not JSON:', event.data.text());
    data = { title: 'SE PASSOU, E PONTO', body: event.data.text() };
  }

  const title = data.title || 'SE PASSOU, E PONTO';
  const options = {
    body: data.body || 'Você tem uma nova notificação.',
    icon: '/pwa-icon-192-v3.png',
    badge: '/pwa-icon-192-v3.png',
    data: data.data || {},
    vibrate: [100, 50, 100],
    tag: data.data?.notification_id || 'general-push',
    renotify: true
  };

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      const isAppFocused = clientList.some(client => client.focused);
      
      // Se o app estiver focado, não mostramos a notificação do sistema para evitar duplicidade com o Toast
      if (isAppFocused) {
        console.log('[SW] App is focused, suppressing system notification');
        return;
      }
      
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification Clicked:', event.notification.data);
  event.notification.close();

  const data = event.notification.data;
  let urlToOpen = '/';

  // Deep Link Logic
  // prioritizes group slug if available, then event_id
  if (data.group_id || data.event_id) {
    const params = new URLSearchParams();
    if (data.group_id) params.append('group', data.group_id);
    if (data.event_id) params.append('event', data.event_id);
    
    // Explicitly set view based on destination
    if (data.destination === 'lista') {
      params.append('view', 'lista');
    } else if (data.destination === 'times') {
      params.append('view', 'times');
    } else {
      // Default to home (inicio)
      params.append('view', 'inicio');
    }
    
    urlToOpen = '/?' + params.toString();
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Try to find existing window on same origin
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === location.origin && 'focus' in client) {
          // Send message to frontend to navigate
          client.postMessage({
            type: 'NAVIGATE',
            url: urlToOpen,
            notification_id: data.notification_id
          });
          return client.focus();
        }
      }
      
      // 2. If no window open, open new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

const CACHE = 'wash-fit-7f356af49573';
const ASSETS = ["./","./index.html","./plataforma.html","./privacidad.html","./css/platform.css?v=7f356af49573","./css/privacy.css","./css/styles.css?v=7f356af49573","./js/platform-model.js?v=7f356af49573","./js/platform-client.js?v=7f356af49573","./js/platform-editor.js?v=7f356af49573","./js/platform-portal.js?v=7f356af49573","./js/core.js?v=7f356af49573","./js/storage.js?v=7f356af49573","./js/chrome-report.js?v=7f356af49573","./js/report-radar.js?v=7f356af49573","./js/drive-archive.js?v=7f356af49573","./js/app.js?v=7f356af49573","./js/config/tailwind-config.js","./js/data/indicators.js?v=7f356af49573","./img/barra.png","./img/paho-logo-blanco.png?v=7f356af49573","./vendor/leaflet-LICENSE","./vendor/leaflet.css?v=7f356af49573","./vendor/leaflet.js?v=7f356af49573","./vendor/lucide-LICENSE","./vendor/lucide.js?v=7f356af49573","./vendor/supabase-LICENSE","./vendor/supabase.js?v=7f356af49573","./vendor/tailwind.css?v=7f356af49573","./vendor/vue-LICENSE","./vendor/vue.global.js?v=7f356af49573","./vendor/images/layers-2x.png","./vendor/images/layers.png","./vendor/images/marker-icon-2x.png","./vendor/images/marker-icon.png","./vendor/images/marker-shadow.png"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('wash-fit-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  // Al abrir la web se usa el HTML actual; sin conexión se recupera la copia instalada.
  // No se recarga ninguna evaluación que el usuario ya tenga abierta.
  if (event.request.mode === 'navigate' && url.origin === scope.origin && [scope.pathname, scope.pathname + 'index.html', scope.pathname + 'plataforma.html', scope.pathname + 'privacidad.html'].includes(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => {
      if (!response.ok) throw new Error('Navigation unavailable');
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match(url.pathname.endsWith('/plataforma.html') ? './plataforma.html' : url.pathname.endsWith('/privacidad.html') ? './privacidad.html' : './'))));
    return;
  }
  // Solo recursos estáticos de esta aplicación; los datos permanecen en IndexedDB.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.some(asset => new URL(asset, self.registration.scope).href === url.href)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request).then(cached => cached || fetch(event.request))));
});
self.addEventListener('message', event => {
  if (event.data === 'offline-status') event.ports[0]?.postMessage('offline-ready');
  if (event.data === 'activate-update') self.skipWaiting();
});

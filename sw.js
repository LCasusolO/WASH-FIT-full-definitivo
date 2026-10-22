const CACHE = 'wash-fit-024123ca60e0';
const ASSETS = ["./","./index.html","./privacidad.html","./css/privacy.css","./css/styles.css?v=024123ca60e0","./js/core.js?v=024123ca60e0","./js/storage.js?v=024123ca60e0","./js/chrome-report.js?v=024123ca60e0","./js/report-radar.js?v=024123ca60e0","./js/drive-archive.js?v=024123ca60e0","./js/app.js?v=024123ca60e0","./js/config/tailwind-config.js","./js/data/indicators.js?v=024123ca60e0","./img/barra.png","./img/paho-logo-blanco.png?v=024123ca60e0","./vendor/leaflet-LICENSE","./vendor/leaflet.css?v=024123ca60e0","./vendor/leaflet.js?v=024123ca60e0","./vendor/lucide-LICENSE","./vendor/lucide.js?v=024123ca60e0","./vendor/tailwind.css?v=024123ca60e0","./vendor/vue-LICENSE","./vendor/vue.global.js?v=024123ca60e0","./vendor/images/layers-2x.png","./vendor/images/layers.png","./vendor/images/marker-icon-2x.png","./vendor/images/marker-icon.png","./vendor/images/marker-shadow.png"];
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
  if (event.request.mode === 'navigate' && url.origin === scope.origin && [scope.pathname, scope.pathname + 'index.html'].includes(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => {
      if (!response.ok) throw new Error('Navigation unavailable');
      return response;
    }).catch(() => caches.open(CACHE).then(cache => cache.match('./'))));
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

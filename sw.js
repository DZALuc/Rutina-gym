/* RUTINA — service worker (backlog #4)
   Objetivo: que la app abra sin conexión en la ruta, incluidas las fotos de los ejercicios
   que ya hayas visto. Todo con rutas RELATIVAS: el deploy vive en un subpath
   (dzaluc.github.io/rutina/) y una ruta absoluta registraría fuera de alcance.

   Tres cachés con ciclos de vida distintos:
   - shell   → versionada: se reemplaza completa en cada despliegue.
   - fuentes → versionada: Google Fonts, se revalidan en segundo plano.
   - fotos   → SIN versionar: las imágenes de free-exercise-db son inmutables (la URL lleva
               el id del ejercicio), así que sobreviven a los despliegues. Si se borraran en
               cada actualización, el usuario perdería offline justo donde más lo necesita. */

const VERSION = 'v1';
const SHELL   = `rutina-shell-${VERSION}`;
const FUENTES = `rutina-fuentes-${VERSION}`;
const FOTOS   = 'rutina-fotos';                 // sin versión a propósito
const VIGENTES = [SHELL, FUENTES, FOTOS];

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

const HOST_FOTOS  = 'raw.githubusercontent.com';
const HOST_FUENTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* Placeholder para una foto que nunca se abrió y ahora no hay red.
   Mejor una caja con el estilo de la app que el icono de imagen rota del navegador. */
const FOTO_OFFLINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
<rect width="160" height="120" fill="#16181a"/>
<rect x="1" y="1" width="158" height="118" fill="none" stroke="#2a2e32" stroke-width="2"/>
<path d="M64 52 h32 M80 44 v24" stroke="#c8fb3d" stroke-width="3" stroke-linecap="round" opacity=".5"/>
<text x="80" y="86" fill="#5c6266" font-family="system-ui,sans-serif" font-size="11" text-anchor="middle">Sin conexión</text>
</svg>`;

const respuestaOffline = () => new Response(FOTO_OFFLINE, {
  headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
});

/* ---------- install: precarga del shell ---------- */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* addAll falla en bloque si UN recurso falla; preferimos instalar lo que sí esté
       disponible antes que dejar al usuario sin service worker por un 404. */
    await Promise.all(APP_SHELL.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { /* recurso opcional ausente: seguimos */ }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- activate: limpiar cachés viejas ---------- */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(
      nombres.filter(n => n.startsWith('rutina-') && !VIGENTES.includes(n))
             .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

/* ---------- estrategias ---------- */

/* Guardable: 200 normal u opaca (las fotos van en modo no-cors desde <img>). */
function guardable(res) {
  return !!res && (res.status === 200 || res.type === 'opaque');
}

/* Cache-first: la foto se guarda la PRIMERA vez que se abre y después ya no toca la red. */
async function cacheFirst(request, nombreCache, alFallar) {
  const cache = await caches.open(nombreCache);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (guardable(res)) await cache.put(request, res.clone());
    return res;
  } catch (e) {
    return alFallar ? alFallar() : Response.error();
  }
}

/* Stale-while-revalidate: responde ya desde caché y actualiza en segundo plano.
   Para las fuentes: nunca bloquean el render y se refrescan solas cuando hay red. */
async function staleWhileRevalidate(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const hit = await cache.match(request);
  const red = fetch(request)
    .then(res => { if (guardable(res)) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  if (hit) return hit;
  const res = await red;
  return res || Response.error();
}

/* Network-first para el documento: si hay red, siempre la versión nueva (la app es un
   solo index.html que se edita seguido); si no, la copia guardada. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (guardable(res)) await cache.put('./index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('./index.html'))
        || (await cache.match('./'))
        || Response.error();
  }
}

/* ---------- fetch ---------- */
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. Navegación → network-first con respaldo offline
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2. Fotos de free-exercise-db → cache-first, con placeholder si nunca se abrió
  if (url.hostname === HOST_FOTOS) {
    event.respondWith(cacheFirst(request, FOTOS, respuestaOffline));
    return;
  }

  // 3. Google Fonts (CSS y archivos de fuente) → stale-while-revalidate
  if (HOST_FUENTES.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FUENTES));
    return;
  }

  // 4. Resto del mismo origen (iconos, manifest) → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});

/* Permite activar una versión nueva sin esperar (lo usa index.html si algún día
   se agrega un aviso de "hay actualización"). */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

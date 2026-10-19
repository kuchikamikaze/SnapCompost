// Service worker UTAMA (satu-satunya). Versi SDK harus sama dengan package.json (firebase 10.14.1).
// Bagian 1: Firebase Cloud Messaging (background push + notification click).
// Bagian 2: Offline caching (precache app shell + stale-while-revalidate untuk aset) — diperlukan agar
//            PWA Builder memberi skor tinggi pada kategori "Offline support" dan TWA bisa dipakai tanpa jaringan.
//
// PENTING — Caching TIDAK boleh merusak FCM:
//   - importScripts Firebase SDK tetap dimuat dari gstatic.com (tidak di-cache SW).
//   - Host gstatic.com, supabase.co, firebasedatabase.app, fcm.googleapis.com dilewati fetch handler.
//   - URL same-origin dengan pathname /api/* (mis. /api/cek-jadwal) SELALU ke jaringan:
//     tidak dibaca dari cache, tidak ditulis ke cache, tidak SWR, tidak fallback offline.
//   - URL yang mengandung token auth (access_token, refresh_token, code, error_description, dst.)
//     dilewati fetch handler agar sesi OAuth tidak ter-cache.
//   - Hanya request GET yang ditangani; POST/PUT/PATCH/DELETE dijatuhkan ke jaringan.
//   - Hanya response same-origin yang berstatus OK (res.ok && res.type === 'basic') yang di-cache.
//   - Response opaque / cors / error / 206 partial TIDAK di-cache.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
              'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA049erIqw5woIx9ZVc52gGIdleL2jYp4s', projectId: 'snapcompost-9f79f', messagingSenderId: '199743837501', appId: '1:199743837501:web:2a72ae4914c688b9bf6154',   // config web Firebase (publik); SW tidak bisa baca import.meta.env
});
const messaging = firebase.messaging();

messaging.onBackgroundMessage(p => {
  const d = p.data ?? {};
  return self.registration.showNotification(d.judul || 'SnapCompost', {
    body: d.isi || '',
    icon: '/icons/icon-192.png',
    data: d,
    tag: d.id_notifikasi,
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data ?? {};
  const url = `/?buka_wadah=${d.id_wadah}&notif=${d.id_notifikasi}`;
  e.waitUntil((async () => {
    const jendela = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (jendela[0]) {
      await jendela[0].focus();
      jendela[0].postMessage({ tipe: 'buka_notifikasi', id_wadah: d.id_wadah, id_notifikasi: d.id_notifikasi });
    } else await clients.openWindow(url);
  })());
});

/* =========================================================================
   BAGIAN 2 — Offline caching (PWA Builder / TWA requirement)
   ========================================================================= */

const VERSI_CACHE = 'snapcompost-v1';
const CACHE_PRECACHE = `${VERSI_CACHE}-precache`;
const CACHE_RUNTIME = `${VERSI_CACHE}-runtime`;

// Aset inti aplikasi (app shell). Didaftar minimal — aset lain di-cache saat diminta pertama kali.
// Catatan: path CSS/JS hasil build Vite ber-hash, jadi kita hanya precache shell statis;
// modul dinamis di-cache lewat strategi runtime di bawah.
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/data-referensi-snapcompost.json',
];

// Host yang JANGAN di-cache (API & backend auth). Fetch selalu ke jaringan.
const HOST_LEWATI = [
  'supabase.co',
  'supabase.in',
  'firebasedatabase.app',
  'fcm.googleapis.com',
  'www.gstatic.com',     // Firebase SDK dimuat ulang setiap kali; tidak perlu di-cache SW
];

// Parameter URL yang menandakan response auth (token, kode, error). Jika ada di URL,
// request TIDAK boleh di-cache (mencegah token OAuth tertangkap di cache storage).
const PARAM_AUTH = [
  'access_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'code',
  'error',
  'error_description',
  'error_code',
  'type',
  'provider_token',
  'buka_wadah',   // link notifikasi (postMessage saja, jangan cache)
  'notif',
];

const lewati = (req) => {
  const u = new URL(req.url, self.location.href);

  // Cross-origin ke backend (Supabase/Firebase/gstatic) → lewati.
  if (u.origin !== self.location.origin) {
    return HOST_LEWATI.some(h => u.hostname.endsWith(h));
  }

  // Same-origin API dinamis (mis. /api/cek-jadwal, /api/*) → SELALU ke jaringan.
  // Tidak boleh: dibaca dari cache, ditulis ke cache, SWR, atau fallback offline lama.
  if (u.pathname.startsWith('/api/')) return true;

  // Same-origin tapi URL mengandung parameter auth/callback → lewati.
  const semua = [...u.searchParams.keys()];
  if (semua.some(k => PARAM_AUTH.includes(k))) return true;

  // Hash fragment bisa juga berisi token (Supabase implicit flow): #access_token=...
  if (u.hash && PARAM_AUTH.some(p => u.hash.includes(p + '='))) return true;

  return false;
};

// Fetch dengan timeout (jaringan lambat → fallback cache).
const fetchDenganTimeout = (req, ms = 4000) => {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => { ctrl.abort(); }, ms);
    fetch(req, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' })
      .then(res => { clearTimeout(t); resolve(res); })
      .catch(err => { clearTimeout(t); reject(err); });
  });
};

// Apakah response aman di-cache?
const amanDicache = (res, req) => {
  if (!res || !res.ok) return false;                          // status non-2xx → jangan cache
  if (res.type !== 'basic') return false;                     // opaque/cors/error → jangan cache
  if (res.status === 206) return false;                        // partial content → jangan cache
  if (req.cache === 'no-store') return false;                 // eksplisit no-store
  return true;
};

// Stale-while-revalidate: kembalikan cache dulu (cepat), lalu update di background.
const swr = async (req) => {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(req);
  const network = fetchDenganTimeout(req).then(res => {
    if (amanDicache(res, req)) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
};

// Network-first dengan fallback cache (untuk navigasi/dokumen).
const networkFirst = async (req) => {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const res = await fetchDenganTimeout(req, 5000);
    if (amanDicache(res, req)) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback terakhir: app shell (agar TWA tidak tampilkan layar putih saat offline).
    // Coba exact match dulu, lalu fallback ke "/" atau "/index.html".
    return (await cache.match(req, { ignoreSearch: true }))
      || (await cache.match('/'))
      || (await cache.match('/index.html'))
      || Response.error();
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_PRECACHE);
    // addAll dengan best-effort: aset yang gagal (mis. tidak ada) tidak boleh gagalkan instalasi.
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) { /* abaikan */ }
    }));
    // Aktifkan langsung tanpa menunggu SW lama dilepas.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(VERSI_CACHE)).map(k => caches.delete(k))
    );
    // Klaim klien agar SW baru langsung mengontrol halaman yang sedang terbuka.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Hanya tangani GET. POST/PUT/PATCH/DELETE → lewati ke jaringan.
  if (req.method !== 'GET') return;

  // 2) Lewati request cross-origin ke backend (Supabase/Firebase) atau URL dengan param auth.
  if (lewati(req)) return;

  // 3) Request non-http(s) (chrome-extension:, data:, blob:, file:) → lewati.
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // 4) Navigasi (HTML): network-first, fallback app shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // 5) Aset statis (CSS/JS/ikon/font/model): stale-while-revalidate.
  //    Model ONNX 43MB juga masuk sini → di-cache runtime sekali, lalu di-serve dari cache.
  event.respondWith(swr(req));
});

// Pesan dari halaman: "SKIP_WAITING" agar update SW langsung aktif tanpa refresh ganda.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

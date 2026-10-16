// Notifications push (FCM) : messages reçus même appli fermée
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
firebase.initializeApp({ apiKey: 'AIzaSyAlanpPYiUG8tg0P8prqMjYiHH2QmEqKcc', authDomain: 'monstertracker-bymiyuki.firebaseapp.com', projectId: 'monstertracker-bymiyuki', storageBucket: 'monstertracker-bymiyuki.firebasestorage.app', messagingSenderId: '714396226229', appId: '1:714396226229:web:9fd3fc50d9396ca7a324fc' });
const mtMessaging = firebase.messaging();
// messages « données seulement » : on affiche nous-mêmes la notification
mtMessaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'MonsterTracker', { body: d.body || '', icon: './icon.png', badge: './icon.png', tag: d.tag || 'mt', data: { url: d.url || './' } });
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

// MonsterTracker statique — Service Worker
// Cache d'abord (network-first en ligne, cache en secours) → fonctionne hors-ligne une fois visité.
const CACHE = 'mt-v80';
const IMGS = 'mt-img-v80';
const SHELL = ['./', './index.html', './support.html', './css/style.css?v=80', './js/app.js?v=80', './js/support.js', './js/qrcode.min.js', './icon.png', './img/logo-wordmark.png', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// v65 : les images et les polices sont servis depuis le cache tout de suite
// (plus de revalidation réseau à chaque affichage) ; le code et les pages
// restent pris en ligne en priorité pour recevoir les mises à jour.
const STATIQUE = /\.(png|jpe?g|webp|svg|gif|ico|woff2?|ttf|otf)(\?|$)/i;

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  if (STATIQUE.test(url.pathname)) {
    e.respondWith(
      caches.open(IMGS).then((c) => c.match(e.request).then((hit) => {
        const reseau = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
        return hit || reseau;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('./index.html')))
  );
});

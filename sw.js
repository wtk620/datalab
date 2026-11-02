/* DataLab Demo 0.1.1 — Service Worker：缓存静态资源，支持离线使用 */
var CACHE_NAME = 'datalab-demo01-v2';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './judge.js',
  './data.js',
  './syntax.js',
  './sql-wasm.js',
  './sql-wasm.wasm',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  // 网络优先：在线时总是获取最新内容；离线时回退到缓存
  e.respondWith(
    fetch(e.request).then(function (resp) {
      var copy = resp.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, copy); });
      return resp;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});

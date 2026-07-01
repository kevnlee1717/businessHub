const CACHE_NAME = "ipad-pdf-cache-v2";
const IPAD_SLIDES_PATH = "/uploads/ipad-slides/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(IPAD_SLIDES_PATH)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // 只缓存完整的 200 响应:Cache API 无法存 206(Range 分块)响应,put 会抛错。
      // 前端已用 disableRange 让 PDF 走整包 GET,这里作为兜底再判一次 status===200。
      if (response.status === 200) {
        // 后台写入,不阻塞返回;吞掉配额/写入异常,避免 unhandled rejection。
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
  );
});

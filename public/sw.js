const CACHE_NAME = "dropagg-offline-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/brands",
  "/manifest.json",
];

// Install Event - Pre-cache core shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Stale-While-Revalidate Strategy for offline resilience
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Ignore non-GET or chrome-extension requests
  if (request.method !== "GET" || !request.url.startsWith("http")) return;

  // For API endpoints, try network first, fallback to offline response
  if (request.url.includes("/api/")) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ offline: true, message: "Offline Mode Active" }),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Network First with Cache Fallback for Pages & Assets
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        // Fallback for navigation HTML pages
        if (request.headers.get("accept")?.includes("text/html")) {
          return caches.match("/");
        }

        return new Response("Offline content unavailable", { status: 503 });
      })
  );
});

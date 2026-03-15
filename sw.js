const CACHE_NAME = "bin-dashboard-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./main.js",
  "./app.webmanifest",
  "./icons/icon.svg",
  "./icons/maskable.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const isAppShell =
    url.origin === self.location.origin &&
    (
      url.pathname.endsWith("/") ||
      url.pathname.endsWith("/index.html") ||
      url.pathname.endsWith("/main.js") ||
      url.pathname.endsWith("/app.webmanifest") ||
      url.pathname.includes("/icons/")
    );

  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => {
      if (request.mode === "navigate") {
        return caches.match("./index.html");
      }
      return new Response("Offline", { status: 503, statusText: "Offline" });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Bin Dashboard";
  const options = {
    body: data.body || "",
    icon: "./icons/icon.svg",
    badge: "./icons/icon.svg",
    data: { url: "./" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "./";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
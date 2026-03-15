const CACHE="bin-dashboard-v1";

self.addEventListener("install",e=>{
self.skipWaiting();
});

self.addEventListener("activate",e=>{
self.clients.claim();
});

self.addEventListener("fetch",e=>{
return;
});
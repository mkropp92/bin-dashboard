# Sunshine Coast Bin Push Backend

Tiny Node backend for Web Push notifications.

## Included
- VAPID public key endpoint
- subscription save/remove endpoints
- welcome notification endpoint
- nightly 6:00 PM Australia/Sydney reminder job

## Files
- `server.js`
- `package.json`
- `.env.example`
- `subscriptions.json`

## Quick start

1. Install dependencies

```bash
npm install
```

2. Generate VAPID keys

```bash
npm run genkeys
```

3. Copy `.env.example` to `.env` and paste your keys.

4. Start the server

```bash
npm start
```

## Frontend changes needed

### Add to `sw.js`

```javascript
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
    badge: "./icons/icon.svg"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
```

### Add to your frontend `main.js`

Set your backend URL:

```javascript
const PUSH_BACKEND_URL = "https://your-backend-domain.example";
```

Add helpers:

```javascript
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey() {
  const res = await fetch(`${PUSH_BACKEND_URL}/vapid-public-key`);
  if (!res.ok) throw new Error("Failed to get VAPID public key");
  const data = await res.json();
  return data.publicKey;
}

async function subscribeForPush(settings) {
  if (!("serviceWorker" in navigator)) throw new Error("Service worker not supported");
  if (!("PushManager" in window)) throw new Error("Push not supported");
  if (!("Notification" in window)) throw new Error("Notifications not supported");
  if (Notification.permission !== "granted") throw new Error("Notifications not granted");

  const reg = await navigator.serviceWorker.ready;
  const publicKey = await getVapidPublicKey();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  const payload = {
    subscription: sub.toJSON(),
    locality: settings.locality,
    dow: settings.dow,
    weekGroup: settings.weekGroup,
    invertAlternateCycle: settings.invertAlternateCycle
  };

  const saveRes = await fetch(`${PUSH_BACKEND_URL}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!saveRes.ok) throw new Error("Failed to save push subscription");

  const welcomeRes = await fetch(`${PUSH_BACKEND_URL}/send-welcome`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() })
  });

  if (!welcomeRes.ok) throw new Error("Failed to send welcome notification");

  return true;
}
```

### After location lookup succeeds

```javascript
await subscribeForPush(result);
result.notificationsEnabled = true;
saveSettings(result);
```

## Notes
- iPhone web push needs an installed Home Screen web app on iOS/iPadOS 16.4+.
- `subscriptions.json` is fine for a tiny setup. Move to a real database later if needed.

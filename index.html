const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STORAGE_KEY = "binDashboardSettingsV15";
const WEATHER_CACHE_KEY = "binDashboardWeatherCacheV1";
const PUSH_BACKEND_URL = "https://bin-dashboard-1.onrender.com";

const REGION_COORDS = {
  "Sunshine Coast": { latitude: -26.6500, longitude: 153.0667 },
  "Caloundra": { latitude: -26.8030, longitude: 153.1210 },
  "Buderim": { latitude: -26.6850, longitude: 153.0570 },
  "Maroochydore": { latitude: -26.6570, longitude: 153.0880 },
  "Mooloolaba": { latitude: -26.6810, longitude: 153.1190 },
  "Nambour": { latitude: -26.6280, longitude: 152.9590 },
  "Coolum Beach": { latitude: -26.5280, longitude: 153.0880 },
  "Peregian Beach": { latitude: -26.4820, longitude: 153.0960 },
  "Noosa Heads": { latitude: -26.3940, longitude: 153.0900 },
  "Noosaville": { latitude: -26.4010, longitude: 153.0660 },
  "Yandina": { latitude: -26.5620, longitude: 152.9560 },
  "Maleny": { latitude: -26.7590, longitude: 152.8510 }
};

const defaultSettings = {
  ready: false,
  source: "manual-setup",
  locality: "Sunshine Coast",
  dow: 1,
  weekGroup: 1,
  invertAlternateCycle: true,
  latitude: REGION_COORDS["Sunshine Coast"].latitude,
  longitude: REGION_COORDS["Sunshine Coast"].longitude,
  lastLookupAt: "",
  notificationsEnabled: false
};

let deferredInstallPrompt = null;

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...defaultSettings };
  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WEATHER_CACHE_KEY);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function atMidday(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayDiff(a, b) {
  return Math.round((atMidday(a) - atMidday(b)) / 86400000);
}

function htmlEscape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isCollectionDay(date, dow) {
  return date.getDay() === Number(dow);
}

function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function currentWeekMatchesAddress(settings, date) {
  const weekNo = getIsoWeekNumber(date);
  const currentGroup = (weekNo % 2 === 0) ? 2 : 1;
  return Number(settings.weekGroup) === currentGroup;
}

function isRecycleWeek(date, settings) {
  let recycle = currentWeekMatchesAddress(settings, date);
  if (settings.invertAlternateCycle) recycle = !recycle;
  return recycle;
}

function bannerText(settings) {
  if (!settings.ready) return "Set your collection day and week group to configure the dashboard.";

  const now = new Date();
  const dowNow = now.getDay();
  const hourNow = now.getHours();

  let daysUntil = Number(settings.dow) - dowNow;
  if (daysUntil < 0) daysUntil += 7;

  if (daysUntil === 0) {
    if (hourNow < 12) return "Bin day today. If they are not already out, put bins out now.";
    return "Bin collection is today.";
  }
  if (daysUntil === 1 && hourNow >= 16) return "Put bins out tonight.";
  if (daysUntil === 1) return "Bin day tomorrow.";
  return `Next collection in ${daysUntil} days.`;
}

function secondaryChip(ev, ready) {
  if (!ready) return { text: "Not set", cls: "bin-blue" };
  if (ev.recycle) return { text: "Recycling", cls: "bin-yellow" };
  if (ev.organics) return { text: "Garden Organics", cls: "bin-lime" };
  return { text: "General Waste", cls: "bin-red" };
}

function upcomingCollections(settings) {
  const today = atMidday(new Date());
  const out = [];

  for (let i = 0; i < 160 && out.length < 14; i++) {
    const d = addDays(today, i);
    if (!isCollectionDay(d, settings.dow)) continue;

    let recycle = false;
    let organics = false;
    if (settings.ready) {
      recycle = isRecycleWeek(d, settings);
      organics = !recycle;
    }

    out.push({
      date: d,
      iso: toIso(d),
      pretty: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      prettyShort: `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
      recycle,
      organics
    });
  }

  return out;
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("./sw.js");
  }
}

function setupInstallPrompt() {
  const btn = document.getElementById("installBtn");

  if (isIOS()) {
    if (btn) btn.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btn) btn.hidden = false;
  });

  if (btn) {
    btn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btn.hidden = true;
    });
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) return "unsupported";
  return await Notification.requestPermission();
}

async function ensureNotificationsFromUserAction() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await requestNotifications();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

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

function getWeatherCache() {
  try {
    return JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setWeatherCache(cache) {
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
}

function getWeatherCacheKey(dateIso, lat, lon) {
  return `${dateIso}|${Number(lat).toFixed(4)}|${Number(lon).toFixed(4)}`;
}

async function fetchWeatherForDate(targetDateIso, lat, lon) {
  const cache = getWeatherCache();
  const key = getWeatherCacheKey(targetDateIso, lat, lon);
  const now = Date.now();

  if (cache[key] && (now - cache[key].savedAt < 30 * 60 * 1000)) {
    return cache[key].data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Australia%2FSydney`;

  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error("Weather request failed");

  const data = await res.json();
  const idx = data.daily.time.indexOf(targetDateIso);
  if (idx === -1) return null;

  const result = {
    date: targetDateIso,
    tMax: data.daily.temperature_2m_max[idx],
    tMin: data.daily.temperature_2m_min[idx],
    rainChance: data.daily.precipitation_probability_max[idx],
    code: data.daily.weathercode[idx]
  };

  cache[key] = { savedAt: now, data: result };
  setWeatherCache(cache);

  return result;
}

function weatherLabel(code) {
  if ([0].includes(code)) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Forecast available";
}

async function renderWeather(settings, nextDateIso) {
  const box = document.getElementById("weatherBox");
  if (!box) return;

  box.textContent = "Loading weather…";

  try {
    const wx = await fetchWeatherForDate(nextDateIso, settings.latitude, settings.longitude);
    if (!wx) {
      box.textContent = "No forecast available for that date yet.";
      return;
    }

    box.innerHTML = `
      <b>${htmlEscape(weatherLabel(wx.code))}</b><br>
      ${htmlEscape(wx.date)}<br>
      Max ${htmlEscape(wx.tMax)}°C / Min ${htmlEscape(wx.tMin)}°C<br>
      Rain chance: ${htmlEscape(wx.rainChance)}%
    `;
  } catch (err) {
    box.textContent = "Weather unavailable.";
  }
}

function maybeSendBinReminder(nextCollectionDateIso) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const next = new Date(`${nextCollectionDateIso}T06:00:00`);
  const reminder = new Date(next);
  reminder.setDate(reminder.getDate() - 1);
  reminder.setHours(18, 0, 0, 0);

  const key = `bin-reminder-${nextCollectionDateIso}`;
  if (localStorage.getItem(key)) return;

  if (now >= reminder && now < next) {
    localStorage.setItem(key, "1");
  }
}

function applySetup() {
  const locality = document.getElementById("localityInput").value;
  const dow = Number(document.getElementById("dowInput").value);
  const weekGroup = Number(document.getElementById("weekGroupInput").value);
  const coords = REGION_COORDS[locality] || REGION_COORDS["Sunshine Coast"];

  const current = loadSettings();
  const updated = {
    ...current,
    ready: true,
    source: "manual-setup",
    locality,
    dow,
    weekGroup,
    invertAlternateCycle: true,
    latitude: coords.latitude,
    longitude: coords.longitude,
    lastLookupAt: new Date().toISOString()
  };

  saveSettings(updated);
  render(updated);
  return updated;
}

function hydrateSetupForm(settings) {
  const localityInput = document.getElementById("localityInput");
  const dowInput = document.getElementById("dowInput");
  const weekGroupInput = document.getElementById("weekGroupInput");

  if (localityInput) localityInput.value = settings.locality || "Sunshine Coast";
  if (dowInput) dowInput.value = String(settings.dow || 1);
  if (weekGroupInput) weekGroupInput.value = String(settings.weekGroup || 1);
}

function render(settings = loadSettings()) {
  const today = atMidday(new Date());
  const upcoming = upcomingCollections(settings);
  const next = upcoming[0] || null;

  hydrateSetupForm(settings);

  const banner = document.getElementById("bannerText");
  if (banner) banner.textContent = bannerText(settings);

  const setupLine = document.getElementById("setupLine");
  if (setupLine) {
    setupLine.innerHTML = settings.ready
      ? `Region: <b>Sunshine Coast</b><br>
         Area: <b>${htmlEscape(settings.locality || "Unknown")}</b><br>
         Collection day: <b>${htmlEscape(DOW_NAMES[settings.dow])}</b><br>
         Week group: <b>${htmlEscape(settings.weekGroup)}</b><br>
         Notifications: <b>${settings.notificationsEnabled ? "On" : "Off"}</b>`
      : "Schedule not configured yet for Sunshine Coast.";
  }

  const lookupStatus = document.getElementById("lookupStatus");
  if (lookupStatus) {
    lookupStatus.innerHTML = settings.ready
      ? `Last saved setup: <span class="success">${htmlEscape(new Date(settings.lastLookupAt || Date.now()).toLocaleString())}</span>`
      : `<span class="warn">Set your collection day and week group, then save.</span>`;
  }

  const daysAwayEl = document.getElementById("daysAway");
  const nextPrettyEl = document.getElementById("nextPretty");
  const nextSecondaryEl = document.getElementById("nextSecondary");
  const weatherBox = document.getElementById("weatherBox");

  if (next && settings.ready) {
    const daysAway = Math.max(0, dayDiff(next.date, today));
    const s = secondaryChip(next, settings.ready);

    if (daysAwayEl) daysAwayEl.textContent = daysAway;
    if (nextPrettyEl) nextPrettyEl.textContent = next.pretty;
    if (nextSecondaryEl) {
      nextSecondaryEl.textContent = s.text;
      nextSecondaryEl.className = `chip ${s.cls}`;
    }

    setTimeout(() => {
      renderWeather(settings, next.iso);
      maybeSendBinReminder(next.iso);
    }, 50);
  } else {
    if (daysAwayEl) daysAwayEl.textContent = "—";
    if (nextPrettyEl) nextPrettyEl.textContent = "—";
    if (nextSecondaryEl) {
      nextSecondaryEl.textContent = "—";
      nextSecondaryEl.className = "chip bin-blue";
    }
    if (weatherBox) weatherBox.textContent = "Configure setup first.";
  }

  const upcomingList = document.getElementById("upcomingList");
  if (upcomingList) {
    upcomingList.innerHTML = "";
    if (settings.ready) {
      upcoming.slice(0, 8).forEach(ev => {
        const s = secondaryChip(ev, settings.ready);
        const row = document.createElement("div");
        row.className = "up-item";
        row.innerHTML = `
          <div>
            <div class="up-title">${htmlEscape(ev.prettyShort)}</div>
            <div class="up-sub">General Waste + ${htmlEscape(s.text)}</div>
          </div>
          <div>
            <span class="chip bin-red">General</span>
            <span class="chip ${htmlEscape(s.cls)}">${htmlEscape(s.text)}</span>
          </div>
        `;
        upcomingList.appendChild(row);
      });
    }
  }

  const calendar = document.getElementById("calendar");
  const title = document.getElementById("monthTitle");
  if (calendar && title) {
    calendar.innerHTML = "";

    const map = {};
    upcoming.forEach(ev => { map[ev.iso] = ev; });

    const y = today.getFullYear();
    const m = today.getMonth();
    title.textContent = `${MONTH_NAMES[m]} ${y}`;

    DOW_SHORT.forEach(d => {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      calendar.appendChild(h);
    });

    const first = new Date(y, m, 1, 12, 0, 0);
    const firstDow = first.getDay();
    const lastDay = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement("div");
      blank.className = "day blank";
      calendar.appendChild(blank);
    }

    for (let d = 1; d <= lastDay; d++) {
      const cell = document.createElement("div");
      cell.className = "day";
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;

      if (iso === toIso(today)) cell.classList.add("today");

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = d;
      cell.appendChild(num);

      if (settings.ready) {
        const ev = map[iso];
        if (ev) {
          const g = document.createElement("div");
          g.className = "mini";
          g.style.background = "#ef4444";
          g.style.color = "#fff";
          g.textContent = "General";
          cell.appendChild(g);

          const s = secondaryChip(ev, settings.ready);
          const sec = document.createElement("div");
          sec.className = "mini";

          if (s.cls === "bin-yellow") {
            sec.style.background = "#facc15";
            sec.style.color = "#111827";
          } else if (s.cls === "bin-lime") {
            sec.style.background = "#84cc16";
            sec.style.color = "#111827";
          } else {
            sec.style.background = "#49b6ff";
            sec.style.color = "#08243b";
          }

          sec.textContent = s.text;
          cell.appendChild(sec);
        }
      }

      calendar.appendChild(cell);
    }
  }
}

function setupManualSetup() {
  const saveBtn = document.getElementById("saveSetupBtn");
  const status = document.getElementById("lookupStatus");
  if (!saveBtn || !status) return;

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    status.innerHTML = `<span class="warn">Saving setup…</span>`;

    try {
      const result = applySetup();

      const permission = await ensureNotificationsFromUserAction();
      const notificationsEnabled = permission === "granted";

      if (notificationsEnabled) {
        await subscribeForPush(result);
        result.notificationsEnabled = true;
        saveSettings(result);
      }

      render(result);

      status.innerHTML = notificationsEnabled
        ? `<span class="success">Setup saved. Notifications are on.</span>`
        : `<span class="success">Setup saved.</span>`;
    } catch (err) {
      status.innerHTML = `<span class="error">${htmlEscape(err.message || "Setup failed.")}</span>`;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function setupUtilityButtons() {
  const resetBtn = document.getElementById("resetBtn");

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetSettings();
      render(loadSettings());
    });
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  setupInstallPrompt();
  setupManualSetup();
  setupUtilityButtons();

  render(loadSettings());

  try {
    await registerServiceWorker();
  } catch {}
});
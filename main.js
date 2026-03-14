const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STORAGE_KEY = "binDashboardSettingsV10";
const WEATHER_CACHE_KEY = "binDashboardWeatherCacheV1";
const SCC_LAYER_URL =
  "https://geopublic.scc.qld.gov.au/arcgis/rest/services/Health/DomesticBinCollectionDays_SCRC/MapServer/0/query";

const defaultSettings = {
  ready: false,
  source: "manual",
  locality: "Nambour",
  dow: 1,
  weekGroup: 1,
  invertAlternateCycle: true,
  latitude: -26.6269,
  longitude: 152.9594,
  lastLookupAt: ""
};

let deferredInstallPrompt = null;

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...defaultSettings };
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      locality: parsed.locality || defaultSettings.locality
    };
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

function getDowIndexFromName(name) {
  return DOW_NAMES.findIndex(d => d.toLowerCase() === String(name || "").toLowerCase());
}

function htmlEscape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeWhitespace(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
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
  if (!settings.ready) return "Use current location to configure the dashboard.";

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

async function showNotification(title, body) {
  if (!("serviceWorker" in navigator)) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: "./icons/icon.svg",
    badge: "./icons/icon.svg"
  });
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
    showNotification("Put bins out tonight", "Your next bin collection is tomorrow.");
    localStorage.setItem(key, "1");
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
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

  const res = await fetchWithTimeout(url, {}, 5000);
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

  cache[key] = {
    savedAt: now,
    data: result
  };
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
    console.error(err);
  }
}

async function runCouncilQueryByLocation(lat, lon) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "Locality,Week,CollectionDay,Latitude,Longitude",
    returnGeometry: "false",
    f: "json",
    distance: "150",
    units: "esriSRUnit_Meter"
  });

  const res = await fetchWithTimeout(`${SCC_LAYER_URL}?${params.toString()}`, {}, 5000);
  if (!res.ok) throw new Error("Council location lookup failed");

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || "Council location lookup error");
  }

  return Array.isArray(data.features) ? data.features : [];
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function featureToSettings(attrs, currentLat, currentLon) {
  const dow = getDowIndexFromName(attrs.CollectionDay);
  if (dow < 0) {
    throw new Error("Lookup succeeded but collection day was missing.");
  }

  const featureLat = Number(attrs.Latitude || currentLat);
  const featureLon = Number(attrs.Longitude || currentLon);

  return {
    ready: true,
    source: "current-location",
    locality: normalizeWhitespace(attrs.Locality || "Unknown"),
    dow,
    weekGroup: Number(attrs.Week || 1),
    invertAlternateCycle: true,
    latitude: featureLat,
    longitude: featureLon,
    lastLookupAt: new Date().toISOString()
  };
}

async function fetchCouncilBinScheduleByCurrentLocation(lat, lon) {
  let features = await runCouncilQueryByLocation(lat, lon);

  if (!features.length) {
    throw new Error("No nearby bin collection suburb found for your location.");
  }

  const ranked = features
    .map(f => {
      const attrs = f.attributes || {};
      const featureLat = Number(attrs.Latitude || lat);
      const featureLon = Number(attrs.Longitude || lon);
      const dist = distanceMeters(lat, lon, featureLat, featureLon);
      return {
        attrs,
        dist
      };
    })
    .sort((a, b) => a.dist - b.dist);

  return featureToSettings(ranked[0].attrs, lat, lon);
}

function getCurrentPositionPromise() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

function render(settings = loadSettings()) {
  const today = atMidday(new Date());
  const upcoming = upcomingCollections(settings);
  const next = upcoming[0] || null;

  const banner = document.getElementById("bannerText");
  if (banner) banner.textContent = bannerText(settings);

  const setupLine = document.getElementById("setupLine");
  if (setupLine) {
    setupLine.innerHTML = settings.ready
      ? `Suburb: <b>${htmlEscape(settings.locality || "Unknown")}</b><br>
         Collection day: <b>${htmlEscape(DOW_NAMES[settings.dow])}</b><br>
         Alternate cycle: <b>Flipped</b>`
      : "Schedule not configured yet.";
  }

  const lookupStatus = document.getElementById("lookupStatus");
  if (lookupStatus) {
    lookupStatus.className = "small";
    lookupStatus.innerHTML = settings.ready
      ? `Last lookup: <span class="success">${htmlEscape(new Date(settings.lastLookupAt || Date.now()).toLocaleString())}</span>`
      : `<span class="warn">Use current location to configure the app.</span>`;
  }

  const daysAwayEl = document.getElementById("daysAway");
  const nextPrettyEl = document.getElementById("nextPretty");
  const nextSecondaryEl = document.getElementById("nextSecondary");
  const weatherBox = document.getElementById("weatherBox");

  if (next) {
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
    if (nextSecondaryEl) nextSecondaryEl.textContent = "—";
    if (weatherBox) weatherBox.textContent = "Configure lookup first.";
  }

  const upcomingList = document.getElementById("upcomingList");
  if (upcomingList) {
    upcomingList.innerHTML = "";
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

  const calendar = document.getElementById("calendar");
  const title = document.getElementById("monthTitle");
  if (calendar && title) {
    calendar.innerHTML = "";

    const map = {};
    upcoming.forEach(ev => {
      map[ev.iso] = ev;
    });

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

      calendar.appendChild(cell);
    }
  }
}

function setupLocationLookup() {
  const btn = document.getElementById("useLocationBtn");
  const status = document.getElementById("lookupStatus");

  if (!btn || !status) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "small";
    status.innerHTML = `<span class="warn">Getting your location…</span>`;

    try {
      await ensureNotificationsFromUserAction();

      const position = await getCurrentPositionPromise();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      status.innerHTML = `<span class="warn">Finding nearby bin collection suburb…</span>`;

      const result = await fetchCouncilBinScheduleByCurrentLocation(lat, lon);
      saveSettings(result);

      status.innerHTML = `<span class="success">Location lookup successful.</span>`;
      render(result);
    } catch (err) {
      console.error(err);
      status.innerHTML = `<span class="error">${htmlEscape(err.message || "Location lookup failed.")}</span>`;
    } finally {
      btn.disabled = false;
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
  setupLocationLookup();
  setupUtilityButtons();

  render(loadSettings());

  try {
    await registerServiceWorker();
  } catch (err) {
    console.error("Service worker failed:", err);
  }
});
const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STORAGE_KEY = "binDashboardSettingsV4";
const WEATHER_CACHE_KEY = "binDashboardWeatherCacheV1";
const SCC_LAYER_URL =
  "https://geopublic.scc.qld.gov.au/arcgis/rest/services/Health/DomesticBinCollectionDays_SCRC/MapServer/0/query";

const defaultSettings = {
  ready: false,
  source: "manual",
  propertyNumber: "",
  streetName: "",
  locality: "Nambour",
  formattedAddress: "",
  dow: 1,
  weekGroup: 1,
  invertAlternateCycle: false,
  latitude: -26.6269,
  longitude: 152.9594,
  lastLookupAt: ""
};

let deferredInstallPrompt = null;
let selectedSuggestion = null;
let searchTimer = null;
let activeSearchToken = 0;

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

function cleanLocality(locality) {
  return normalizeWhitespace(locality).replaceAll("'", "''").toUpperCase();
}

function cleanStreetName(streetName) {
  return normalizeWhitespace(streetName)
    .toUpperCase()
    .replace(/\bSTREET\b/g, "")
    .replace(/\bST\b/g, "")
    .replace(/\bROAD\b/g, "")
    .replace(/\bRD\b/g, "")
    .replace(/\bAVENUE\b/g, "")
    .replace(/\bAVE\b/g, "")
    .replace(/\bDRIVE\b/g, "")
    .replace(/\bDR\b/g, "")
    .replace(/\bCOURT\b/g, "")
    .replace(/\bCT\b/g, "")
    .replace(/\bPLACE\b/g, "")
    .replace(/\bPL\b/g, "")
    .replace(/\bLANE\b/g, "")
    .replace(/\bLN\b/g, "")
    .replace(/\bCRESCENT\b/g, "")
    .replace(/\bCRES\b/g, "")
    .replace(/\bPARADE\b/g, "")
    .replace(/\bPDE\b/g, "")
    .replace(/\bBOULEVARD\b/g, "")
    .replace(/\bBLVD\b/g, "")
    .replace(/\bTERRACE\b/g, "")
    .replace(/\bTCE\b/g, "")
    .replace(/\bWAY\b/g, "")
    .replace(/\bCIRCUIT\b/g, "")
    .replace(/\bCCT\b/g, "")
    .replace(/\bCLOSE\b/g, "")
    .replace(/\bCL\b/g, "")
    .replace(/\bHIGHWAY\b/g, "")
    .replace(/\bHWY\b/g, "")
    .replace(/\bMOUNT\b/g, "MT")
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll("'", "''");
}

function parseAddressInput(input) {
  const text = normalizeWhitespace(input);
  const match = text.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  let propertyNumber = match[1];
  let rest = normalizeWhitespace(match[2]);

  let locality = "Nambour";
  if (rest.includes(",")) {
    const parts = rest.split(",");
    rest = normalizeWhitespace(parts[0]);
    locality = normalizeWhitespace(parts.slice(1).join(" "));
    if (!locality) locality = "Nambour";
  }

  return {
    propertyNumber,
    streetName: rest,
    locality
  };
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
  if (!settings.ready) return "Search for your address to configure the dashboard.";

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
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById("installBtn");
    if (btn) btn.hidden = false;
  });

  const installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installBtn.hidden = true;
    });
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported in this browser.");
    return "unsupported";
  }
  return await Notification.requestPermission();
}

async function showNotification(title, body) {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: "./icons/icon.svg",
    badge: "./icons/icon.svg"
  });
}

function setupNotificationButtons() {
  document.getElementById("enableNotifBtn").addEventListener("click", async () => {
    const permission = await requestNotifications();
    alert(`Notification permission: ${permission}`);
  });

  document.getElementById("testNotifBtn").addEventListener("click", async () => {
    if (Notification.permission !== "granted") {
      const permission = await requestNotifications();
      if (permission !== "granted") return;
    }
    await showNotification("Bin Dashboard", "Notifications are working.");
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
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

  const res = await fetchWithTimeout(url, {}, 4000);
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

async function runCouncilQuery(where, limit = 20) {
  const params = new URLSearchParams({
    where,
    outFields: "Property_Number,Streetname,Locality,Address,Week,CollectionDay,Latitude,Longitude",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: String(limit),
    orderByFields: "Streetname ASC, Property_Number ASC"
  });

  const res = await fetchWithTimeout(`${SCC_LAYER_URL}?${params.toString()}`, {}, 4000);
  if (!res.ok) throw new Error("Council lookup failed");

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || "Council lookup error");
  }

  return Array.isArray(data.features) ? data.features : [];
}

function scoreFeature(attrs, wanted) {
  const street = cleanStreetName(attrs.Streetname || "");
  const loc = cleanLocality(attrs.Locality || "");
  const num = String(attrs.Property_Number || "");

  let score = 0;

  if (num === wanted.propertyNumber) score += 100;
  if (loc === cleanLocality(wanted.locality)) score += 50;

  const wantedStreet = cleanStreetName(wanted.streetName);
  if (street === wantedStreet) score += 40;
  if (street.startsWith(wantedStreet)) score += 20;
  if (street.includes(wantedStreet)) score += 10;

  return score;
}

function featureToSettings(attrs, original) {
  const dow = getDowIndexFromName(attrs.CollectionDay);
  if (dow < 0) {
    throw new Error("Lookup succeeded but collection day was missing.");
  }

  return {
    ready: true,
    source: "scc-auto",
    propertyNumber: String(original.propertyNumber).trim(),
    streetName: normalizeWhitespace(original.streetName),
    locality: normalizeWhitespace(original.locality),
    formattedAddress: attrs.Address || `${original.propertyNumber} ${original.streetName}, ${original.locality}`,
    dow,
    weekGroup: Number(attrs.Week || 1),
    invertAlternateCycle: false,
    latitude: Number(attrs.Latitude || -26.6269),
    longitude: Number(attrs.Longitude || 152.9594),
    lastLookupAt: new Date().toISOString()
  };
}

async function fetchCouncilBinSchedule(propertyNumber, streetName, locality) {
  const num = String(propertyNumber).trim();
  const loc = cleanLocality(locality);

  const exactWhere = `Property_Number=${Number(num)} AND UPPER(Locality)='${loc}'`;
  let features = await runCouncilQuery(exactWhere, 50);

  if (!features.length) {
    features = await runCouncilQuery(`Property_Number=${Number(num)}`, 100);
  }

  if (!features.length) {
    throw new Error("No property found with that house number.");
  }

  const ranked = [...features]
    .map(f => ({
      feature: f,
      score: scoreFeature(f.attributes || {}, { propertyNumber: num, streetName, locality })
    }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length || ranked[0].score < 10) {
    throw new Error("House number found, but street name did not match well enough.");
  }

  return featureToSettings(ranked[0].feature.attributes || {}, { propertyNumber: num, streetName, locality });
}

async function searchAddressSuggestions(query) {
  const parsed = parseAddressInput(query);
  if (!parsed) return [];

  const propertyNumber = Number(parsed.propertyNumber);
  const locality = cleanLocality(parsed.locality);
  const street = cleanStreetName(parsed.streetName);

  let features = await runCouncilQuery(
    `Property_Number=${propertyNumber} AND UPPER(Locality)='${locality}'`,
    50
  );

  if (!features.length) {
    features = await runCouncilQuery(`Property_Number=${propertyNumber}`, 100);
  }

  const ranked = features
    .map(f => {
      const attrs = f.attributes || {};
      const streetDb = cleanStreetName(attrs.Streetname || "");
      const locDb = cleanLocality(attrs.Locality || "");
      let score = 0;

      if (locDb === locality) score += 50;
      if (streetDb === street) score += 40;
      if (streetDb.startsWith(street)) score += 25;
      if (streetDb.includes(street)) score += 10;

      return { attrs, score };
    })
    .filter(x => x.score >= 10)
    .sort((a, b) => b.score - a.score);

  const unique = [];
  const seen = new Set();

  for (const item of ranked) {
    const key = `${item.attrs.Address}|${item.attrs.Locality}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item.attrs);
    if (unique.length >= 8) break;
  }

  return unique.map(attrs => ({
    label: attrs.Address || `${attrs.Property_Number} ${attrs.Streetname}, ${attrs.Locality}`,
    propertyNumber: String(attrs.Property_Number || parsed.propertyNumber),
    streetName: attrs.Streetname || parsed.streetName,
    locality: attrs.Locality || parsed.locality
  }));
}

function renderSuggestions(items) {
  const box = document.getElementById("suggestions");
  if (!box) return;

  box.innerHTML = "";

  if (!items.length) {
    box.hidden = true;
    return;
  }

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "suggestion";
    div.textContent = item.label;
    div.addEventListener("click", () => {
      selectedSuggestion = item;
      document.getElementById("addressSearch").value = item.label;
      box.hidden = true;
    });
    box.appendChild(div);
  }

  box.hidden = false;
}

function render(settings = loadSettings()) {
  const today = atMidday(new Date());
  const upcoming = upcomingCollections(settings);
  const next = upcoming[0] || null;

  document.getElementById("bannerText").textContent = bannerText(settings);

  document.getElementById("setupLine").innerHTML = settings.ready
    ? `Address: <b>${htmlEscape(settings.formattedAddress || `${settings.propertyNumber} ${settings.streetName}, ${settings.locality}`)}</b><br>
       Collection day: <b>${htmlEscape(DOW_NAMES[settings.dow])}</b><br>
       Alternate week group: <b>${htmlEscape(settings.weekGroup)}</b>${settings.invertAlternateCycle ? " (flipped)" : ""}`
    : "Schedule not configured yet.";

  document.getElementById("addressSearch").value = settings.ready
    ? (settings.formattedAddress || `${settings.propertyNumber} ${settings.streetName}, ${settings.locality}`)
    : "";

  const lookupStatus = document.getElementById("lookupStatus");
  lookupStatus.className = "small";
  lookupStatus.innerHTML = settings.ready
    ? `Last lookup: <span class="success">${htmlEscape(new Date(settings.lastLookupAt || Date.now()).toLocaleString())}</span>`
    : `<span class="warn">Search for your address to configure the app.</span>`;

  if (next) {
    const daysAway = Math.max(0, dayDiff(next.date, today));
    const s = secondaryChip(next, settings.ready);

    document.getElementById("daysAway").textContent = daysAway;
    document.getElementById("nextPretty").textContent = next.pretty;

    const chip = document.getElementById("nextSecondary");
    chip.textContent = s.text;
    chip.className = `chip ${s.cls}`;

    setTimeout(() => {
      renderWeather(settings, next.iso);
      maybeSendBinReminder(next.iso);
    }, 50);
  } else {
    document.getElementById("daysAway").textContent = "—";
    document.getElementById("nextPretty").textContent = "—";
    document.getElementById("nextSecondary").textContent = "—";
    document.getElementById("weatherBox").textContent = "Configure lookup first.";
  }

  const upcomingList = document.getElementById("upcomingList");
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

  const calendar = document.getElementById("calendar");
  const title = document.getElementById("monthTitle");
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

function setupAddressSearch() {
  const input = document.getElementById("addressSearch");
  const form = document.getElementById("lookupForm");
  const status = document.getElementById("lookupStatus");

  input.addEventListener("input", () => {
    selectedSuggestion = null;
    const query = input.value.trim();
    const token = ++activeSearchToken;

    if (searchTimer) clearTimeout(searchTimer);

    if (query.length < 4) {
      renderSuggestions([]);
      return;
    }

    searchTimer = setTimeout(async () => {
      try {
        const items = await searchAddressSuggestions(query);
        if (token !== activeSearchToken) return;
        renderSuggestions(items);
      } catch (err) {
        if (token !== activeSearchToken) return;
        console.error(err);
        renderSuggestions([]);
      }
    }, 300);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      const box = document.getElementById("suggestions");
      if (box) box.hidden = true;
    }, 150);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    status.className = "small";
    status.innerHTML = `<span class="warn">Looking up council data…</span>`;

    try {
      let chosen = selectedSuggestion;

      if (!chosen) {
        const parsed = parseAddressInput(input.value);
        if (!parsed) {
          throw new Error("Enter an address like: 57 Solandra, Nambour");
        }
        chosen = parsed;
      }

      const result = await fetchCouncilBinSchedule(
        chosen.propertyNumber,
        chosen.streetName,
        chosen.locality
      );

      saveSettings(result);
      status.innerHTML = `<span class="success">Lookup successful.</span>`;
      render(result);
    } catch (err) {
      console.error(err);
      status.innerHTML = `<span class="error">${htmlEscape(err.message || "Lookup failed.")}</span>`;
    }
  });
}

function setupUtilityButtons() {
  document.getElementById("flipCycleBtn").addEventListener("click", () => {
    const settings = loadSettings();
    settings.invertAlternateCycle = !settings.invertAlternateCycle;
    saveSettings(settings);
    render(settings);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    resetSettings();
    selectedSuggestion = null;
    render(loadSettings());
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  setupInstallPrompt();
  setupNotificationButtons();
  setupAddressSearch();
  setupUtilityButtons();

  render(loadSettings());

  try {
    await registerServiceWorker();
  } catch (err) {
    console.error("Service worker failed:", err);
  }
});
const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STORAGE_KEY = "binDashboardSettingsV2";
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
  knownDate: "",
  knownType: "recycle",
  weekGroup: 1,
  invertAlternateCycle: false,
  latitude: -26.6269,
  longitude: 152.9594,
  lastLookupAt: ""
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
  return normalizeWhitespace(locality)
    .replaceAll("'", "''")
    .toUpperCase();
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

/*
  Inference:
  SCC publishes a Week field but the public layer page does not define whether
  Week=1 means recycling week or organics week. This app treats the looked-up
  week group as the active alternate-bin week and defaults that active week
  to recycling. If needed, the user can flip it with invertAlternateCycle.
*/
function currentWeekMatchesAddress(settings, date) {
  const weekNo = getIsoWeekNumber(date);
  const currentGroup = (weekNo % 2 === 0) ? 2 : 1;
  return Number(settings.weekGroup) === currentGroup;
}

function isRecycleWeek(date, settings) {
  const match = currentWeekMatchesAddress(settings, date);
  let recycle = match;
  if (settings.invertAlternateCycle) recycle = !recycle;
  return recycle;
}

function bannerText(settings) {
  if (!settings.ready) return "Enter your address and run Sunshine Coast lookup.";

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

async function fetchWeatherForDate(targetDateIso, lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Australia%2FSydney`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather request failed");
  const data = await res.json();

  const idx = data.daily.time.indexOf(targetDateIso);
  if (idx === -1) return null;

  return {
    date: targetDateIso,
    tMax: data.daily.temperature_2m_max[idx],
    tMin: data.daily.temperature_2m_min[idx],
    rainChance: data.daily.precipitation_probability_max[idx],
    code: data.daily.weathercode[idx]
  };
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
    box.textContent = "Unable to load weather.";
    console.error(err);
  }
}

function buildWhereExact(propertyNumber, streetName, locality) {
  const street = cleanStreetName(streetName);
  const loc = cleanLocality(locality);
  const num = Number(propertyNumber);
  return `Property_Number=${num} AND UPPER(Streetname)='${street}' AND UPPER(Locality)='${loc}'`;
}

function buildWherePrefix(propertyNumber, streetName, locality) {
  const street = cleanStreetName(streetName);
  const loc = cleanLocality(locality);
  const num = Number(propertyNumber);
  return `Property_Number=${num} AND UPPER(Streetname) LIKE '${street}%' AND UPPER(Locality)='${loc}'`;
}

function buildWhereContains(propertyNumber, streetName, locality) {
  const street = cleanStreetName(streetName);
  const loc = cleanLocality(locality);
  const num = Number(propertyNumber);
  return `Property_Number=${num} AND UPPER(Streetname) LIKE '%${street}%' AND UPPER(Locality)='${loc}'`;
}

async function runCouncilQuery(where) {
  const params = new URLSearchParams({
    where,
    outFields: "Property_Number,Streetname,Locality,Address,Week,CollectionDay,Latitude,Longitude",
    returnGeometry: "false",
    f: "json"
  });

  const res = await fetch(`${SCC_LAYER_URL}?${params.toString()}`);
  if (!res.ok) throw new Error("Council lookup failed");
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "Council lookup error");
  }

  return Array.isArray(data.features) ? data.features : [];
}

function rankFeatures(features, propertyNumber, streetName, locality) {
  const wantedStreet = cleanStreetName(streetName);
  const wantedLoc = cleanLocality(locality);
  const wantedNum = Number(propertyNumber);

  return [...features].sort((a, b) => {
    const aa = a.attributes || {};
    const bb = b.attributes || {};

    const aStreet = cleanStreetName(aa.Streetname || "");
    const bStreet = cleanStreetName(bb.Streetname || "");
    const aLoc = cleanLocality(aa.Locality || "");
    const bLoc = cleanLocality(bb.Locality || "");
    const aNum = Number(aa.Property_Number || 0);
    const bNum = Number(bb.Property_Number || 0);

    const aScore =
      (aNum === wantedNum ? 100 : 0) +
      (aLoc === wantedLoc ? 50 : 0) +
      (aStreet === wantedStreet ? 40 : 0) +
      (aStreet.startsWith(wantedStreet) ? 20 : 0) +
      (aStreet.includes(wantedStreet) ? 10 : 0);

    const bScore =
      (bNum === wantedNum ? 100 : 0) +
      (bLoc === wantedLoc ? 50 : 0) +
      (bStreet === wantedStreet ? 40 : 0) +
      (bStreet.startsWith(wantedStreet) ? 20 : 0) +
      (bStreet.includes(wantedStreet) ? 10 : 0);

    return bScore - aScore;
  });
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
    lastLookupAt: new Date().toISOString(),
    knownDate: "",
    knownType: "recycle"
  };
}

async function fetchCouncilBinSchedule(propertyNumber, streetName, locality) {
  const queries = [
    { label: "exact", where: buildWhereExact(propertyNumber, streetName, locality) },
    { label: "prefix", where: buildWherePrefix(propertyNumber, streetName, locality) },
    { label: "contains", where: buildWhereContains(propertyNumber, streetName, locality) }
  ];

  let allMatches = [];
  let lastError = null;

  for (const q of queries) {
    try {
      const features = await runCouncilQuery(q.where);
      if (features.length > 0) {
        allMatches = rankFeatures(features, propertyNumber, streetName, locality);
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!allMatches.length) {
    if (lastError) {
      throw new Error(`Council lookup failed: ${lastError.message}`);
    }

    const cleanedStreet = cleanStreetName(streetName);
    throw new Error(
      `No matching address found. Try house number only, street name without road type, and locality exactly. Example street: "${cleanedStreet}".`
    );
  }

  const chosen = allMatches[0];
  const attrs = chosen.attributes || {};
  return featureToSettings(attrs, { propertyNumber, streetName, locality });
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

  document.getElementById("propertyNumber").value = settings.propertyNumber || "";
  document.getElementById("streetName").value = settings.streetName || "";
  document.getElementById("locality").value = settings.locality || "Nambour";

  const lookupStatus = document.getElementById("lookupStatus");
  lookupStatus.className = "small";
  lookupStatus.innerHTML = settings.ready
    ? `Last lookup: <span class="success">${htmlEscape(new Date(settings.lastLookupAt || Date.now()).toLocaleString())}</span>`
    : `<span class="warn">Run council lookup to configure the app.</span>`;

  if (next) {
    const daysAway = Math.max(0, dayDiff(next.date, today));
    const s = secondaryChip(next, settings.ready);

    document.getElementById("daysAway").textContent = daysAway;
    document.getElementById("nextPretty").textContent = next.pretty;

    const chip = document.getElementById("nextSecondary");
    chip.textContent = s.text;
    chip.className = `chip ${s.cls}`;

    renderWeather(settings, next.iso);
    maybeSendBinReminder(next.iso);
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
  upcoming.forEach(ev => map[ev.iso] = ev);

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

function setupLookupForm() {
  document.getElementById("lookupForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const propertyNumber = document.getElementById("propertyNumber").value.trim();
    const streetName = document.getElementById("streetName").value.trim();
    const locality = document.getElementById("locality").value.trim();

    const status = document.getElementById("lookupStatus");
    status.className = "small";
    status.innerHTML = `<span class="warn">Looking up council data…</span>`;

    try {
      const result = await fetchCouncilBinSchedule(propertyNumber, streetName, locality);
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
    render(loadSettings());
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  await registerServiceWorker();
  setupInstallPrompt();
  setupNotificationButtons();
  setupLookupForm();
  setupUtilityButtons();
  render(loadSettings());
});
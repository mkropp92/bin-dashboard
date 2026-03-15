const STORAGE_KEY = "binSettings";

const REGION_COORDS = {
  "Nambour": { lat: -26.628, lon: 152.959 },
  "Caloundra": { lat: -26.803, lon: 153.121 },
  "Buderim": { lat: -26.685, lon: 153.057 },
  "Maroochydore": { lat: -26.657, lon: 153.088 },
  "Mooloolaba": { lat: -26.681, lon: 153.119 },
  "Coolum Beach": { lat: -26.528, lon: 153.088 },
  "Noosa Heads": { lat: -26.394, lon: 153.09 },
  "Noosaville": { lat: -26.401, lon: 153.066 },
  "Peregian Beach": { lat: -26.482, lon: 153.096 },
  "Yandina": { lat: -26.562, lon: 152.956 },
  "Maleny": { lat: -26.759, lon: 152.851 },
  "Sunshine Coast": { lat: -26.65, lon: 153.06 }
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function bannerText(settings) {
  if (!settings.ready) return "Set your collection day.";

  const now = new Date();
  const dow = now.getDay();

  let diff = settings.dow - dow;
  if (diff < 0) diff += 7;

  if (diff === 0) return "Bin day today.";
  if (diff === 1) return "Put bins out tonight.";

  return `Next collection in ${diff} days.`;
}

function upcoming(settings) {
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);

    if (d.getDay() === settings.dow) {
      return d;
    }
  }

  return null;
}

function render() {
  const settings = loadSettings();

  const banner = document.getElementById("bannerText");
  const daysAway = document.getElementById("daysAway");
  const nextPretty = document.getElementById("nextPretty");
  const nextSecondary = document.getElementById("nextSecondary");
  const setupLine = document.getElementById("setupLine");
  const lookupStatus = document.getElementById("lookupStatus");

  if (banner) {
    banner.textContent = bannerText(settings);
  }

  if (!settings.ready) {
    if (daysAway) daysAway.textContent = "—";
    if (nextPretty) nextPretty.textContent = "—";
    if (nextSecondary) nextSecondary.innerHTML = "—";
    if (setupLine) setupLine.innerHTML = "Schedule not configured yet.";
    if (lookupStatus) lookupStatus.textContent = "Set your collection day and week group, then save.";
    return;
  }

  const next = upcoming(settings);
  const today = new Date();

  if (next) {
    const diffMs = new Date(
      next.getFullYear(),
      next.getMonth(),
      next.getDate()
    ) - new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const diffDays = Math.round(diffMs / 86400000);

    if (daysAway) daysAway.textContent = diffDays;
    if (nextPretty) nextPretty.textContent = next.toDateString();

    const startOfYear = new Date(next.getFullYear(), 0, 1);
    const week = Math.ceil((((next - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);

    let recycle = (week % 2) === settings.weekGroup;
    if (settings.invert) recycle = !recycle;

    if (nextSecondary) {
      nextSecondary.innerHTML = recycle
        ? `<span class="chip bin-yellow">Recycling</span>`
        : `<span class="chip bin-lime">Garden</span>`;
    }
  }

  if (setupLine) {
    setupLine.innerHTML =
      `Area: ${settings.locality}<br>` +
      `Collection: ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][settings.dow]}`;
  }

  if (lookupStatus) {
    lookupStatus.textContent = "Saved.";
  }

  const localityInput = document.getElementById("localityInput");
  const dowInput = document.getElementById("dowInput");
  const weekGroupInput = document.getElementById("weekGroupInput");

  if (localityInput && settings.locality) localityInput.value = settings.locality;
  if (dowInput && settings.dow !== undefined) dowInput.value = String(settings.dow);
  if (weekGroupInput && settings.weekGroup !== undefined) weekGroupInput.value = String(settings.weekGroup);
}

function setup() {
  const btn = document.getElementById("saveSetupBtn");
  if (!btn) return;

  btn.onclick = () => {
    const locality = document.getElementById("localityInput").value;
    const dow = Number(document.getElementById("dowInput").value);
    const weekGroup = Number(document.getElementById("weekGroupInput").value);

    const settings = {
      ready: true,
      locality,
      dow,
      weekGroup,
      invert: true,
      coords: REGION_COORDS[locality] || REGION_COORDS["Sunshine Coast"]
    };

    saveSettings(settings);

    const lookupStatus = document.getElementById("lookupStatus");
    if (lookupStatus) lookupStatus.textContent = "Saved.";

    render();
  };
}

window.addEventListener("DOMContentLoaded", () => {
  setup();
  render();
});
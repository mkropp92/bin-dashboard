import express from "express";
import cors from "cors";
import cron from "node-cron";
import webpush from "web-push";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "subscriptions.json");
const TZ = "Australia/Sydney";

const {
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
} = process.env;

if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error("Missing VAPID env vars. Copy .env.example to .env and fill it in.");
}

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function subscriptionKey(sub) {
  return sub?.endpoint || "";
}

function upsertSubscription(record) {
  const db = readDb();
  const key = subscriptionKey(record.subscription);
  const idx = db.findIndex(r => subscriptionKey(r.subscription) === key);

  const clean = {
    subscription: record.subscription,
    locality: record.locality || "Sunshine Coast",
    dow: Number(record.dow),
    weekGroup: Number(record.weekGroup),
    invertAlternateCycle: !!record.invertAlternateCycle,
    notificationsEnabled: true,
    lastSentForDate: record.lastSentForDate || null,
    updatedAt: new Date().toISOString()
  };

  if (idx >= 0) {
    db[idx] = { ...db[idx], ...clean };
  } else {
    db.push(clean);
  }

  writeDb(db);
}

function removeSubscription(endpoint) {
  const db = readDb().filter(r => subscriptionKey(r.subscription) !== endpoint);
  writeDb(db);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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

function nextCollectionFor(settings, fromDate) {
  for (let i = 0; i < 14; i++) {
    const d = addDays(fromDate, i);
    if (d.getDay() !== Number(settings.dow)) continue;

    const recycle = isRecycleWeek(d, settings);
    return {
      date: d,
      iso: toIso(d),
      recycle,
      organics: !recycle
    };
  }
  return null;
}

function collectionLabel(info) {
  if (!info) return "General Waste";
  return info.recycle ? "Recycling" : "Garden Organics";
}

async function sendPush(subscription, payload) {
  await webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/subscribe", async (req, res) => {
  try {
    const { subscription, locality, dow, weekGroup, invertAlternateCycle } = req.body || {};

    if (!subscription?.endpoint) {
      return res.status(400).json({ error: "Missing subscription" });
    }

    upsertSubscription({
      subscription,
      locality,
      dow,
      weekGroup,
      invertAlternateCycle
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

app.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

    removeSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

app.post("/send-welcome", async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: "Missing subscription" });
    }

    await sendPush(subscription, {
      title: "Welcome",
      body: "You will now start receiving notifications the night before collection"
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);

    if (err.statusCode === 404 || err.statusCode === 410) {
      removeSubscription(req.body?.subscription?.endpoint || "");
    }

    res.status(500).json({ error: "Failed to send welcome push" });
  }
});

cron.schedule("0 18 * * *", async () => {
  const db = readDb();
  const now = new Date();

  console.log("Running reminder job", now.toISOString(), "records:", db.length);

  for (const record of db) {
    try {
      if (!record.notificationsEnabled) continue;

      const tomorrow = addDays(now, 1);
      const next = nextCollectionFor(record, tomorrow);

      if (!next) continue;
      if (next.iso !== toIso(tomorrow)) continue;
      if (record.lastSentForDate === next.iso) continue;

      await sendPush(record.subscription, {
        title: "Put bins out tonight",
        body: `Tomorrow is collection day. Put out General Waste + ${collectionLabel(next)}.`
      });

      record.lastSentForDate = next.iso;
      record.updatedAt = new Date().toISOString();
      writeDb(db);
    } catch (err) {
      console.error("Push send failed:", err?.statusCode, err?.body || err);

      if (err?.statusCode === 404 || err?.statusCode === 410) {
        removeSubscription(record.subscription?.endpoint || "");
      }
    }
  }
}, { timezone: TZ });

app.listen(PORT, () => {
  console.log(`Push backend running on port ${PORT}`);
});

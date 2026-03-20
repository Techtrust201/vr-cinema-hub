#!/usr/bin/env node
/**
 * VR Ultimate — Full-Stack Server (frontend + ADB sync API)
 * ==========================================================
 * This single server:
 *   1. Serves the React production build from ../dist/  (after npm run build)
 *   2. Exposes the ADB sync API under /api/*
 *   3. Handles React Router client-side routes via catch-all → index.html
 *
 * Prerequisites:
 *   - Node.js >= 18
 *   - ADB installed and in PATH (Android Platform Tools)
 *   - Meta Quest connected via USB or Wi-Fi ADB
 *
 * First-time setup (run once from the project root):
 *   npm install              ← install React deps
 *   npm install -g express   ← OR: cd server && npm init -y && npm install express cors
 *
 * Build + run (production, single command):
 *   npm run build && npm start
 *   → App available at http://localhost:3001
 *
 * Development (hot-reload):
 *   npm run dev              ← Vite dev server on :8080, proxies /api → :3001
 *   node server/sync-server.js  ← ADB API on :3001
 *
 * Override video storage path:
 *   VIDEO_STORAGE_PATH=/my/videos npm start
 */

const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Config ──────────────────────────────────────────────────────────────────
// Override with env var: VIDEO_STORAGE_PATH=/my/videos node sync-server.js
const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || "/videos/vr-ultimate";

app.use(cors({ origin: "*" })); // Allow all origins for local dev
app.use(express.json());

// ─── API routes — all prefixed with /api so Vite proxy can forward them ───────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: "1.0.0", storagePath: VIDEO_STORAGE_PATH });
});

// Backward-compat alias (for direct access without proxy)
app.get("/health", (req, res) => {
  res.json({ ok: true, version: "1.0.0", storagePath: VIDEO_STORAGE_PATH });
});

// ─── Helper: check if ADB is in PATH ─────────────────────────────────────────
function checkAdb() {
  try {
    execSync("adb version", { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── List ADB devices ─────────────────────────────────────────────────────────
function listAdbDevices(res) {
  if (!checkAdb()) {
    return res.status(503).json({ error: "ADB not found in PATH. Install Android Platform Tools." });
  }
  try {
    const output = execSync("adb devices -l", { encoding: "utf8" });
    const lines = output.split("\n").slice(1).filter((l) => l.trim() && !l.startsWith("*"));
    const devices = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const serial = parts[0];
      const status = parts[1] ?? "offline";
      const modelMatch = line.match(/model:(\S+)/);
      const model = modelMatch ? modelMatch[1].replace(/_/g, " ") : "Meta Quest";
      const ipAddress = serial.includes(":") ? serial.split(":")[0] : null;
      return { serial, model, status, ipAddress };
    });
    res.json(devices.filter((d) => d.serial));
  } catch (err) {
    console.error("ADB error:", err.message);
    res.status(500).json({ error: "ADB not available or no devices found", detail: err.message });
  }
}

app.get("/api/devices", (req, res) => listAdbDevices(res));
app.get("/devices", (req, res) => listAdbDevices(res)); // backward compat

// ─── Connect a device via Wi-Fi ADB ──────────────────────────────────────────
app.post("/api/connect", (req, res) => {
  const { ip, port = 5555 } = req.body;
  if (!ip) return res.status(400).json({ error: "Missing ip" });
  if (!checkAdb()) return res.status(503).json({ error: "ADB not found in PATH" });
  try {
    const output = execSync(`adb connect ${ip}:${port}`, { encoding: "utf8", timeout: 10000 });
    const success = output.toLowerCase().includes("connected");
    res.json({ success, output: output.trim(), address: `${ip}:${port}` });
  } catch (err) {
    res.status(500).json({ error: "adb connect failed", detail: err.message });
  }
});

// ─── Real device status (battery + storage) from ADB ─────────────────────────
app.get("/api/device-status/:serial", (req, res) => {
  const { serial } = req.params;
  if (!checkAdb()) return res.status(503).json({ error: "ADB not found in PATH" });
  try {
    // Battery level
    let battery = 0;
    try {
      const batteryOut = execSync(`adb -s ${serial} shell dumpsys battery`, { encoding: "utf8", timeout: 5000 });
      const match = batteryOut.match(/level:\s*(\d+)/);
      if (match) battery = parseInt(match[1], 10);
    } catch {}

    // Storage /sdcard
    let storageUsedGB = 0;
    let storageTotalGB = 0;
    try {
      const dfOut = execSync(`adb -s ${serial} shell df /sdcard`, { encoding: "utf8", timeout: 5000 });
      const lines = dfOut.split("\n").filter((l) => l.includes("/sdcard") || l.match(/\d+/));
      // Parse last data line: Filesystem 1K-blocks Used Available Use% Mounted
      const dataLine = lines.find((l) => l.match(/\d{4,}/));
      if (dataLine) {
        const parts = dataLine.trim().split(/\s+/);
        // df on Android: Filesystem Size Used Avail Use% Mount
        // Sometimes sizes are in K, sometimes with suffix (G/M)
        const parseSize = (s) => {
          if (!s) return 0;
          const n = parseFloat(s);
          if (s.endsWith("G")) return n;
          if (s.endsWith("M")) return n / 1024;
          if (s.endsWith("K") || !isNaN(n)) return n / (1024 * 1024); // KB → GB
          return 0;
        };
        if (parts.length >= 4) {
          storageTotalGB = parseSize(parts[1]);
          storageUsedGB = parseSize(parts[2]);
        }
      }
    } catch {}

    // Connection status
    let status = "offline";
    try {
      const stateOut = execSync(`adb -s ${serial} get-state`, { encoding: "utf8", timeout: 3000 }).trim();
      status = stateOut === "device" ? "connected" : stateOut;
    } catch {}

    res.json({ serial, battery, storageUsedGB, storageTotalGB, status });
  } catch (err) {
    res.status(500).json({ error: "Failed to read device status", detail: err.message });
  }
});

// ─── Sync videos to a device ──────────────────────────────────────────────────
async function handleSync(req, res) {
  const { deviceSerial, videoStoragePath, videos } = req.body;

  if (!deviceSerial || !videos || !Array.isArray(videos)) {
    return res.status(400).json({ error: "Missing deviceSerial or videos" });
  }

  const storagePath = videoStoragePath || VIDEO_STORAGE_PATH;
  const lines = [];
  let pushed = 0;
  let skipped = 0;
  let errors = 0;

  const ts = () => {
    const d = new Date();
    return `[${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}]`;
  };

  lines.push(`${ts()} Connexion ADB → ${deviceSerial}`);

  try {
    execSync(`adb -s ${deviceSerial} get-state`, { encoding: "utf8" });
    lines.push(`${ts()} Appareil connecté ✓`);
  } catch {
    lines.push(`${ts()} ✗ Appareil non disponible (${deviceSerial})`);
    return res.json({ pushed: 0, skipped: 0, errors: videos.length, lines });
  }

  const targetDir = "/sdcard/Movies/VR-Ultimate/";
  try {
    execSync(`adb -s ${deviceSerial} shell mkdir -p ${targetDir}`);
  } catch {}

  for (const video of videos) {
    const localPath = path.join(storagePath, video.name);
    if (!fs.existsSync(localPath)) {
      lines.push(`${ts()} Skip: ${video.name} (fichier introuvable localement)`);
      skipped++;
      continue;
    }

    try {
      const remoteSize = execSync(
        `adb -s ${deviceSerial} shell stat -c%s "${targetDir}${video.name}" 2>/dev/null || echo 0`,
        { encoding: "utf8" }
      ).trim();
      const localSize = fs.statSync(localPath).size;
      if (parseInt(remoteSize) === localSize && parseInt(remoteSize) > 0) {
        lines.push(`${ts()} Skip: ${video.name} (déjà présent, même taille)`);
        skipped++;
        continue;
      }
    } catch {}

    try {
      execSync(`adb -s ${deviceSerial} push "${localPath}" "${targetDir}${video.name}"`, {
        encoding: "utf8",
        timeout: 5 * 60 * 1000,
      });
      lines.push(`${ts()} Push: ${video.name} (${video.sizeGB.toFixed(2)} GB) ✓`);
      pushed++;
    } catch (err) {
      lines.push(`${ts()} ✗ Erreur push: ${video.name} — ${err.message?.slice(0, 80)}`);
      errors++;
    }
  }

  try {
    const manifest = JSON.stringify({ syncedAt: new Date().toISOString(), files: videos.map((v) => v.name) });
    execSync(
      `adb -s ${deviceSerial} shell "echo '${manifest.replace(/'/g, "\\'")}' > ${targetDir}manifest.json"`
    );
    lines.push(`${ts()} manifest.json envoyé ✓`);
  } catch {}

  lines.push(`${ts()} Sync terminée — ${pushed} fichier(s) envoyé(s), ${skipped} ignoré(s), ${errors} erreur(s).`);
  res.json({ pushed, skipped, errors, lines });
}

app.post("/api/sync", handleSync);
app.post("/sync", handleSync); // backward compat

// ─── Serve a local video file (with range/streaming support) ──────────────────
function serveVideo(req, res) {
  const filePath = path.join(VIDEO_STORAGE_PATH, req.params.name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    const chunk = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunk,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

app.get("/api/video/:name", serveVideo);
app.get("/video/:name", serveVideo); // backward compat

// ─── Serve React production build (after `npm run build`) ─────────────────────
const distDir = path.join(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // Catch-all: send index.html for any unknown route so React Router works
  app.get("*", (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send(
      `<h2>🎬 VR Ultimate API running</h2>` +
      `<p>Frontend not built yet. Run <code>npm run build</code> then restart.</p>` +
      `<p>API health: <a href="/api/health">/api/health</a></p>`
    );
  });
}

app.listen(PORT, () => {
  console.log(`\n🎬 VR Ultimate démarré sur http://localhost:${PORT}`);
  if (fs.existsSync(distDir)) {
    console.log(`   ✅ Frontend React servi depuis ./dist/`);
  } else {
    console.log(`   ⚠️  Frontend non compilé — lancez npm run build`);
  }
  console.log(`   📁 Stockage vidéo : ${VIDEO_STORAGE_PATH}`);
  console.log(`   🔧 Pour changer le chemin : VIDEO_STORAGE_PATH=/ton/chemin npm start\n`);
});

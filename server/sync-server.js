#!/usr/bin/env node
/**
 * VR Ultimate — Full-Stack Server (frontend + ADB sync API)
 * ==========================================================
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/devices
 *   POST /api/connect           — adb connect IP:PORT
 *   POST /api/tcpip/:serial     — adb tcpip 5555
 *   GET  /api/device-status/:serial
 *   GET  /api/device-ip/:serial — parse Wi-Fi IP from adb ip route
 *   POST /api/sync/start        — start async job, returns { jobId }
 *   GET  /api/sync/stream/:jobId— SSE stream of log lines
 *   GET  /api/video/:name       — serve video file with range support
 */

const express = require("express");
const cors = require("cors");
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ─── node-notifier (optional — silently disabled if not installed) ─────────────
let notifier = null;
try {
  notifier = require("node-notifier");
} catch {}

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Config ──────────────────────────────────────────────────────────────────
const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || "/videos/vr-ultimate";
const AUTH_TOKEN = process.env.VR_AUTH_TOKEN?.trim() || null;

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Only enabled when VR_AUTH_TOKEN env var is set.
// EventSource (SSE) can't send headers → accept token via ?token= query param as fallback.
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next(); // auth disabled
  const headerToken = req.headers["x-auth-token"];
  const queryToken = req.query?.token;
  if (headerToken === AUTH_TOKEN || queryToken === AUTH_TOKEN) return next();
  res.status(401).json({ error: "Unauthorized — invalid or missing X-Auth-Token" });
}

// Apply auth to all sensitive routes
const PROTECTED = ["/api/sync", "/api/connect", "/api/tcpip", "/api/device-ip", "/api/device-status", "/api/devices"];
app.use((req, res, next) => {
  const isProtected = PROTECTED.some((p) => req.path.startsWith(p.replace("/api", "")));
  if (isProtected) return requireAuth(req, res, next);
  next();
});

// ─── SSE job store ────────────────────────────────────────────────────────────
// jobId → { lines: string[], done: boolean, clients: Set<res> }
const jobs = new Map();

function jobEmit(jobId, line) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.lines.push(line);
  for (const client of job.clients) {
    client.write(`data: ${JSON.stringify({ line })}\n\n`);
  }
}

function jobDone(jobId, summary) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.done = true;
  job.summary = summary;
  for (const client of job.clients) {
    client.write(`data: ${JSON.stringify({ done: true, summary })}\n\n`);
    client.end();
  }
  job.clients.clear();
  // Auto-cleanup after 10 min
  setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
}

// ─── Helper: check if ADB is in PATH ─────────────────────────────────────────
function checkAdb() {
  try {
    execSync("adb version", { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const ts = () => {
  const d = new Date();
  return `[${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}]`;
};

// ─── Health check ─────────────────────────────────────────────────────────────
app.get(["/api/health", "/health"], (req, res) => {
  res.json({ ok: true, version: "1.1.0", storagePath: VIDEO_STORAGE_PATH });
});

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
    res.status(500).json({ error: "ADB not available or no devices found", detail: err.message });
  }
}

app.get(["/api/devices", "/devices"], (req, res) => listAdbDevices(res));

// ─── Connect a device via Wi-Fi ADB ──────────────────────────────────────────
app.post(["/api/connect", "/connect"], (req, res) => {
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

// ─── Prepare Wi-Fi ADB: set device to listen on TCP port 5555 ────────────────
app.post(["/api/tcpip/:serial", "/tcpip/:serial"], (req, res) => {
  const { serial } = req.params;
  if (!checkAdb()) return res.status(503).json({ error: "ADB not found in PATH" });
  try {
    const output = execSync(`adb -s ${serial} tcpip 5555`, { encoding: "utf8", timeout: 8000 });
    res.json({ success: true, output: output.trim() });
  } catch (err) {
    res.status(500).json({ error: "adb tcpip failed", detail: err.message });
  }
});

// ─── Auto-detect device Wi-Fi IP ──────────────────────────────────────────────
app.get(["/api/device-ip/:serial", "/device-ip/:serial"], (req, res) => {
  const { serial } = req.params;
  if (!checkAdb()) return res.status(503).json({ error: "ADB not found in PATH" });
  try {
    // Try wlan0 first (Meta Quest standard), fall back to full ip route
    let ip = null;
    try {
      const out = execSync(`adb -s ${serial} shell ip addr show wlan0`, {
        encoding: "utf8",
        timeout: 5000,
      });
      const match = out.match(/inet\s+([\d.]+)\//);
      if (match) ip = match[1];
    } catch {}

    if (!ip) {
      // Fallback: parse ip route
      try {
        const out = execSync(`adb -s ${serial} shell ip route`, {
          encoding: "utf8",
          timeout: 5000,
        });
        const match = out.match(/src\s+([\d.]+)/);
        if (match) ip = match[1];
      } catch {}
    }

    if (ip) {
      res.json({ ip });
    } else {
      res.status(404).json({ error: "Could not detect Wi-Fi IP. Is Wi-Fi enabled on the headset?" });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to detect IP", detail: err.message });
  }
});

// ─── Real device status (battery + storage) from ADB ─────────────────────────
app.get(["/api/device-status/:serial", "/device-status/:serial"], (req, res) => {
  const { serial } = req.params;
  if (!checkAdb()) return res.status(503).json({ error: "ADB not found in PATH" });
  try {
    let battery = 0;
    try {
      const batteryOut = execSync(`adb -s ${serial} shell dumpsys battery`, { encoding: "utf8", timeout: 5000 });
      const match = batteryOut.match(/level:\s*(\d+)/);
      if (match) battery = parseInt(match[1], 10);
    } catch {}

    let storageUsedGB = 0;
    let storageTotalGB = 0;
    try {
      const dfOut = execSync(`adb -s ${serial} shell df /sdcard`, { encoding: "utf8", timeout: 5000 });
      const lines = dfOut.split("\n").filter((l) => l.includes("/sdcard") || l.match(/\d+/));
      const dataLine = lines.find((l) => l.match(/\d{4,}/));
      if (dataLine) {
        const parts = dataLine.trim().split(/\s+/);
        const parseSize = (s) => {
          if (!s) return 0;
          const n = parseFloat(s);
          if (s.endsWith("G")) return n;
          if (s.endsWith("M")) return n / 1024;
          if (s.endsWith("K") || !isNaN(n)) return n / (1024 * 1024);
          return 0;
        };
        if (parts.length >= 4) {
          storageTotalGB = parseSize(parts[1]);
          storageUsedGB = parseSize(parts[2]);
        }
      }
    } catch {}

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

// ─── SSE: Start an async sync job ─────────────────────────────────────────────
app.post(["/api/sync/start", "/sync/start"], (req, res) => {
  const { deviceSerial, videoStoragePath, videos } = req.body;
  if (!deviceSerial || !videos || !Array.isArray(videos)) {
    return res.status(400).json({ error: "Missing deviceSerial or videos" });
  }

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { lines: [], done: false, clients: new Set(), summary: null });

  res.json({ jobId });

  // Run async after response is sent
  setImmediate(() => runSyncJob(jobId, deviceSerial, videoStoragePath, videos));
});

// ─── SSE: Stream sync job log lines ───────────────────────────────────────────
app.get(["/api/sync/stream/:jobId", "/sync/stream/:jobId"], (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Replay buffered lines
  for (const line of job.lines) {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  }

  if (job.done) {
    res.write(`data: ${JSON.stringify({ done: true, summary: job.summary })}\n\n`);
    return res.end();
  }

  job.clients.add(res);

  req.on("close", () => {
    job.clients.delete(res);
  });
});

// ─── Async sync job using spawn ───────────────────────────────────────────────
async function runSyncJob(jobId, deviceSerial, videoStoragePath, videos) {
  const storagePath = videoStoragePath || VIDEO_STORAGE_PATH;
  let pushed = 0;
  let skipped = 0;
  let errors = 0;

  jobEmit(jobId, `${ts()} Connexion ADB → ${deviceSerial}`);

  // Check device is reachable
  try {
    execSync(`adb -s ${deviceSerial} get-state`, { encoding: "utf8", timeout: 5000 });
    jobEmit(jobId, `${ts()} Appareil connecté ✓`);
  } catch {
    jobEmit(jobId, `${ts()} ✗ Appareil non disponible (${deviceSerial})`);
    return jobDone(jobId, { pushed: 0, skipped: 0, errors: videos.length });
  }

  const targetDir = "/sdcard/Movies/VR-Ultimate/";
  try {
    execSync(`adb -s ${deviceSerial} shell mkdir -p ${targetDir}`);
  } catch {}

  for (const video of videos) {
    const localPath = path.join(storagePath, video.name);
    if (!fs.existsSync(localPath)) {
      jobEmit(jobId, `${ts()} Skip: ${video.name} (fichier introuvable localement)`);
      skipped++;
      continue;
    }

    // Check if already present with same size
    try {
      const remoteSize = execSync(
        `adb -s ${deviceSerial} shell stat -c%s "${targetDir}${video.name}" 2>/dev/null || echo 0`,
        { encoding: "utf8" }
      ).trim();
      const localSize = fs.statSync(localPath).size;
      if (parseInt(remoteSize) === localSize && parseInt(remoteSize) > 0) {
        jobEmit(jobId, `${ts()} Skip: ${video.name} (déjà présent, même taille)`);
        skipped++;
        continue;
      }
    } catch {}

    // Push with spawn for real-time output
    jobEmit(jobId, `${ts()} Push: ${video.name} (${video.sizeGB.toFixed(2)} GB)…`);
    await new Promise((resolve) => {
      const proc = spawn("adb", ["-s", deviceSerial, "push", localPath, `${targetDir}${video.name}`]);
      let lastPct = "";

      proc.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        // adb push outputs progress like: [100%] ...
        const pctMatch = text.match(/\[(\s*\d+)%\]/);
        if (pctMatch && pctMatch[1].trim() !== lastPct) {
          lastPct = pctMatch[1].trim();
          jobEmit(jobId, `${ts()} ${video.name} — ${lastPct}%`);
        }
      });

      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) jobEmit(jobId, `${ts()} ⚠ ${text}`);
      });

      proc.on("close", (code) => {
        if (code === 0) {
          jobEmit(jobId, `${ts()} ✓ ${video.name} — terminé`);
          pushed++;
        } else {
          jobEmit(jobId, `${ts()} ✗ Erreur push: ${video.name} (code ${code})`);
          errors++;
        }
        resolve();
      });

      proc.on("error", (err) => {
        jobEmit(jobId, `${ts()} ✗ Erreur spawn: ${err.message}`);
        errors++;
        resolve();
      });
    });
  }

  // Write manifest
  try {
    const manifest = JSON.stringify({ syncedAt: new Date().toISOString(), files: videos.map((v) => v.name) });
    execSync(
      `adb -s ${deviceSerial} shell "echo '${manifest.replace(/'/g, "\\'")}' > ${targetDir}manifest.json"`
    );
    jobEmit(jobId, `${ts()} manifest.json envoyé ✓`);
  } catch {}

  const summary = { pushed, skipped, errors };
  jobEmit(jobId, `${ts()} Sync terminée — ${pushed} fichier(s) envoyé(s), ${skipped} ignoré(s), ${errors} erreur(s).`);
  jobDone(jobId, summary);
}

// ─── Legacy sync endpoint (backward compat, non-streaming) ────────────────────
app.post(["/api/sync", "/sync"], async (req, res) => {
  const { deviceSerial, videoStoragePath, videos } = req.body;
  if (!deviceSerial || !videos || !Array.isArray(videos)) {
    return res.status(400).json({ error: "Missing deviceSerial or videos" });
  }

  const storagePath = videoStoragePath || VIDEO_STORAGE_PATH;
  const lines = [];
  let pushed = 0, skipped = 0, errors = 0;

  lines.push(`${ts()} Connexion ADB → ${deviceSerial}`);
  try {
    execSync(`adb -s ${deviceSerial} get-state`, { encoding: "utf8" });
    lines.push(`${ts()} Appareil connecté ✓`);
  } catch {
    lines.push(`${ts()} ✗ Appareil non disponible`);
    return res.json({ pushed: 0, skipped: 0, errors: videos.length, lines });
  }

  const targetDir = "/sdcard/Movies/VR-Ultimate/";
  try { execSync(`adb -s ${deviceSerial} shell mkdir -p ${targetDir}`); } catch {}

  for (const video of videos) {
    const localPath = path.join(storagePath, video.name);
    if (!fs.existsSync(localPath)) { lines.push(`${ts()} Skip: ${video.name}`); skipped++; continue; }
    try {
      const remoteSize = execSync(`adb -s ${deviceSerial} shell stat -c%s "${targetDir}${video.name}" 2>/dev/null || echo 0`, { encoding: "utf8" }).trim();
      const localSize = fs.statSync(localPath).size;
      if (parseInt(remoteSize) === localSize && parseInt(remoteSize) > 0) { lines.push(`${ts()} Skip: ${video.name}`); skipped++; continue; }
    } catch {}
    try {
      execSync(`adb -s ${deviceSerial} push "${localPath}" "${targetDir}${video.name}"`, { encoding: "utf8", timeout: 5 * 60 * 1000 });
      lines.push(`${ts()} Push: ${video.name} ✓`);
      pushed++;
    } catch (err) {
      lines.push(`${ts()} ✗ Erreur: ${video.name}`);
      errors++;
    }
  }

  lines.push(`${ts()} Sync terminée — ${pushed} envoyé(s), ${skipped} ignoré(s), ${errors} erreur(s).`);
  res.json({ pushed, skipped, errors, lines });
});

// ─── Serve a local video file (with range/streaming support) ──────────────────
function serveVideo(req, res) {
  const filePath = path.join(VIDEO_STORAGE_PATH, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
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
    res.writeHead(200, { "Content-Length": stat.size, "Content-Type": "video/mp4" });
    fs.createReadStream(filePath).pipe(res);
  }
}

app.get(["/api/video/:name", "/video/:name"], serveVideo);

// ─── Serve React production build ─────────────────────────────────────────────
const distDir = path.join(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
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
  if (fs.existsSync(distDir)) console.log(`   ✅ Frontend React servi depuis ./dist/`);
  else console.log(`   ⚠️  Frontend non compilé — lancez npm run build`);
  console.log(`   📁 Stockage vidéo : ${VIDEO_STORAGE_PATH}`);
  console.log(`   🔧 Pour changer le chemin : VIDEO_STORAGE_PATH=/ton/chemin npm start\n`);
});

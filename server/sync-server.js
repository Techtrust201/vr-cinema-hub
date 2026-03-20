#!/usr/bin/env node
/**
 * VR Ultimate — Local Sync Server
 * ================================
 * Run this on your Mac/PC to enable real ADB sync from the dashboard.
 *
 * Prerequisites:
 *   - Node.js >= 18
 *   - ADB installed and in PATH (Android Platform Tools)
 *   - Meta Quest connected via USB or Wi-Fi ADB
 *
 * Install deps:
 *   cd server && npm init -y && npm install express cors
 *
 * Run:
 *   node server/sync-server.js
 *
 * Configure in the dashboard under Paramètres > URL du serveur local
 * Default: http://localhost:3001
 */

const express = require("express");
const cors = require("cors");
const { execSync, exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Config ──────────────────────────────────────────────────────────────────
// Override with env var: VIDEO_STORAGE_PATH=/my/videos node sync-server.js
const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || "/videos/vr-ultimate";

app.use(cors({ origin: "*" })); // Allow all origins for local dev
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, version: "1.0.0", storagePath: VIDEO_STORAGE_PATH });
});

// ─── List ADB devices ─────────────────────────────────────────────────────────
app.get("/devices", (req, res) => {
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
});

// ─── Sync videos to a device ──────────────────────────────────────────────────
app.post("/sync", async (req, res) => {
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

  // Check device is available
  try {
    execSync(`adb -s ${deviceSerial} get-state`, { encoding: "utf8" });
    lines.push(`${ts()} Appareil connecté ✓`);
  } catch {
    lines.push(`${ts()} ✗ Appareil non disponible (${deviceSerial})`);
    return res.json({ pushed: 0, skipped: 0, errors: videos.length, lines });
  }

  // Ensure target directory exists on device
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

    // Check if file already exists on device with same size
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

    // Push file
    try {
      execSync(`adb -s ${deviceSerial} push "${localPath}" "${targetDir}${video.name}"`, {
        encoding: "utf8",
        timeout: 5 * 60 * 1000, // 5 min per file
      });
      lines.push(`${ts()} Push: ${video.name} (${video.sizeGB.toFixed(2)} GB) ✓`);
      pushed++;
    } catch (err) {
      lines.push(`${ts()} ✗ Erreur push: ${video.name} — ${err.message?.slice(0, 80)}`);
      errors++;
    }
  }

  // Write manifest.json on device
  try {
    const manifest = JSON.stringify({ syncedAt: new Date().toISOString(), files: videos.map((v) => v.name) });
    execSync(
      `adb -s ${deviceSerial} shell "echo '${manifest.replace(/'/g, "\\'")}' > ${targetDir}manifest.json"`
    );
    lines.push(`${ts()} manifest.json envoyé ✓`);
  } catch {}

  lines.push(`${ts()} Sync terminée — ${pushed} fichier(s) envoyé(s), ${skipped} ignoré(s), ${errors} erreur(s).`);
  res.json({ pushed, skipped, errors, lines });
});

// ─── Serve a local video file to the browser ──────────────────────────────────
app.get("/video/:name", (req, res) => {
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
});

app.listen(PORT, () => {
  console.log(`\n🎬 VR Ultimate Sync Server démarré sur http://localhost:${PORT}`);
  console.log(`   Stockage vidéo : ${VIDEO_STORAGE_PATH}`);
  console.log(`   Pour changer le chemin : VIDEO_STORAGE_PATH=/ton/chemin node sync-server.js\n`);
});

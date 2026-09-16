/**
 * Origine disque : sert les MP4 au casque et reçoit les envois du dashboard.
 * Les gros fichiers passent par Content-Range (paquets < 100 Mo, limite Cloudflare).
 */
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyOrigin } from "./hmac.mjs";

const ROOT = process.env.ORIGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), "data");
const SECRET = process.env.ORIGIN_SECRET || "";
const PORT = Number(process.env.ORIGIN_PORT || 8788);

const MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, content-range, content-length",
  );
  res.setHeader("Access-Control-Expose-Headers", "accept-ranges, content-range, content-length, content-type");
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  if (!decoded.startsWith("/files/")) return null;
  const rel = decoded.slice("/files/".length).replace(/^\/+/, "");
  if (!rel || rel.includes("\0") || rel.split("/").some((p) => p === ".." || p === "")) return null;
  const abs = normalize(join(ROOT, rel));
  const root = normalize(ROOT) + sep;
  if (abs !== normalize(ROOT) && !abs.startsWith(root)) return null;
  return { rel, abs };
}

function parseUploadToken(header) {
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice(7).trim();
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const exp = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(exp) || !sig) return null;
  return { exp, sig };
}

function contentTypeOf(abs) {
  const lower = abs.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return MIME[dot >= 0 ? lower.slice(dot) : ""] ?? "application/octet-stream";
}

function send(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") {
      cors(res);
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      cors(res);
      res.end("ok");
      return;
    }

    const target = safePath(url.pathname);
    if (!target) {
      send(res, 404, "not found");
      return;
    }
    if (!SECRET) {
      send(res, 500, "ORIGIN_SECRET manquant");
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const exp = Number(url.searchParams.get("exp"));
      const sig = url.searchParams.get("sig") || "";
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(exp) || exp < now || !verifyOrigin(SECRET, "GET", target.rel, exp, sig)) {
        send(res, 403, "lien expiré ou invalide");
        return;
      }
      let stat;
      try {
        stat = await fs.stat(target.abs);
      } catch {
        send(res, 404, "fichier absent");
        return;
      }
      if (!stat.isFile()) {
        send(res, 404, "fichier absent");
        return;
      }

      const total = stat.size;
      const range = req.headers.range;
      let start = 0;
      let end = total - 1;
      let status = 200;
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!m) {
          send(res, 416, "range invalide");
          return;
        }
        start = m[1] ? Number(m[1]) : 0;
        end = m[2] ? Number(m[2]) : total - 1;
        if (start > end || start >= total) {
          cors(res);
          res.statusCode = 416;
          res.setHeader("content-range", `bytes */${total}`);
          res.end();
          return;
        }
        end = Math.min(end, total - 1);
        status = 206;
      }

      cors(res);
      res.statusCode = status;
      res.setHeader("cache-control", "private, no-store");
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("content-type", contentTypeOf(target.abs));
      res.setHeader("content-length", String(end - start + 1));
      if (status === 206) res.setHeader("content-range", `bytes ${start}-${end}/${total}`);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(target.abs, { start, end }).pipe(res);
      return;
    }

    if (req.method === "PUT") {
      const tok = parseUploadToken(req.headers.authorization);
      const now = Math.floor(Date.now() / 1000);
      if (!tok || tok.exp < now || !verifyOrigin(SECRET, "PUT", target.rel, tok.exp, tok.sig)) {
        send(res, 403, "jeton d'envoi invalide");
        return;
      }
      await fs.mkdir(dirname(target.abs), { recursive: true });
      const range = req.headers["content-range"];
      let start = 0;
      let total = Number(req.headers["content-length"] || 0);
      if (range) {
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(range));
        if (!m) {
          send(res, 400, "content-range invalide");
          return;
        }
        start = Number(m[1]);
        total = Number(m[3]);
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buf = Buffer.concat(chunks);
      let fh;
      try {
        fh = await fs.open(target.abs, "r+");
      } catch (err) {
        if (err && err.code !== "ENOENT") throw err;
        fh = await fs.open(target.abs, "w+");
      }
      try {
        if (total > 0) await fh.truncate(total);
        await fh.write(buf, 0, buf.length, start);
      } finally {
        await fh.close();
      }
      cors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "DELETE") {
      const tok = parseUploadToken(req.headers.authorization);
      const now = Math.floor(Date.now() / 1000);
      if (!tok || tok.exp < now || !verifyOrigin(SECRET, "DELETE", target.rel, tok.exp, tok.sig)) {
        send(res, 403, "jeton invalide");
        return;
      }
      await fs.unlink(target.abs).catch(() => undefined);
      cors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    send(res, 405, "méthode refusée");
  } catch (err) {
    console.error(err);
    send(res, 500, "erreur origine");
  }
});

await fs.mkdir(ROOT, { recursive: true });
server.listen(PORT, "127.0.0.1", () => {
  console.log(`origine disque sur 127.0.0.1:${PORT} racine=${ROOT}`);
});

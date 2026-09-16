#!/usr/bin/env node
// Vérifie qu'un objet R2 est réellement téléchargeable via une URL signée,
// exactement comme le fait le casque : requête partielle par plage d'octets.
//
// C'est le test à lancer quand un casque reste bloqué en téléchargement : il
// distingue un problème d'identifiants (403), d'objet manquant (404) et de
// réseau, là où l'application ne montre qu'un échec générique.
//
//   node scripts/r2-check.mjs                          # vérifie tout le bucket
//   node scripts/r2-check.mjs location/mon-film.mp4    # vérifie un objet
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, "origin/.env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const k of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    if (!env[k]) throw new Error(`Variable manquante dans origin/.env : ${k}`);
  }
  return env;
}

const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

// Même encodage strict que l'Edge Function : encodeURIComponent laisserait
// passer `!'()*`, et la signature ne correspondrait plus.
function uriEncode(input, encodeSlash) {
  let out = "";
  for (const ch of input) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else if (ch === "/") out += encodeSlash ? "%2F" : "/";
    else for (const b of Buffer.from(ch, "utf8")) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

function presign(env, key, ttl = 900) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const host = new URL(env.R2_ENDPOINT).host;
  const canonicalUri = `/${uriEncode(env.R2_BUCKET, true)}/${uriEncode(key, false)}`;

  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(ttl),
    "X-Amz-SignedHeaders": "host",
  };
  const qs = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k, true)}=${uriEncode(params[k], true)}`)
    .join("&");

  const canonicalRequest = ["GET", canonicalUri, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  let k = Buffer.from(`AWS4${env.R2_SECRET_ACCESS_KEY}`);
  for (const part of [dateStamp, "auto", "s3", "aws4_request"]) k = hmac(k, part);
  return `${env.R2_ENDPOINT}${canonicalUri}?${qs}&X-Amz-Signature=${hmac(k, stringToSign).toString("hex")}`;
}

function listBucketKeys(env) {
  // Réutilise rclone plutôt que de réimplémenter ListObjectsV2 et son XML.
  const { execFileSync } = require("node:child_process");
  const rclone = process.env.RCLONE || `${process.env.HOME}/.local/bin/rclone`;
  const out = execFileSync(rclone, ["lsf", "-R", `R2:${env.R2_BUCKET}`], {
    env: {
      ...process.env,
      RCLONE_CONFIG_R2_TYPE: "s3",
      RCLONE_CONFIG_R2_PROVIDER: "Cloudflare",
      RCLONE_CONFIG_R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      RCLONE_CONFIG_R2_ENDPOINT: env.R2_ENDPOINT,
    },
    encoding: "utf8",
  });
  return out.split("\n").filter((l) => l && !l.endsWith("/"));
}

const env = loadEnv();
const { createRequire } = await import("node:module");
globalThis.require = createRequire(import.meta.url);

const keys = process.argv.slice(2).length ? process.argv.slice(2) : listBucketKeys(env);
let failures = 0;

for (const key of keys) {
  const url = presign(env, key);
  // bytes=0-1023 : le casque télécharge par plages, on valide le même chemin.
  const res = await fetch(url, { headers: { Range: "bytes=0-1023" } });
  const total = res.headers.get("content-range")?.split("/")[1] ?? "?";
  const ok = res.status === 206 || res.status === 200;
  if (!ok) failures++;
  const size = total === "?" ? "" : `${(Number(total) / 1048576).toFixed(1)} Mo`;
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${String(res.status).padEnd(4)} ${size.padStart(9)}  ${key}`);
  if (!ok) console.log(`      ${(await res.text()).slice(0, 200)}`);
}

console.log(`\n${keys.length - failures}/${keys.length} objets accessibles par URL signée.`);
process.exit(failures ? 1 : 0);

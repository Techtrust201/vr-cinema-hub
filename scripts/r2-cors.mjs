#!/usr/bin/env node
// Applique la politique CORS du bucket R2.
//
// Sans elle, l'envoi multipart depuis le dashboard échoue : le navigateur refuse
// de laisser lire l'en-tête `ETag` de chaque morceau, et sans ces ETag R2 ne peut
// pas recoller le fichier. Le symptôme est trompeur — le transfert des octets
// réussit, c'est la finalisation qui casse.
//
//   node scripts/r2-cors.mjs          # applique
//   node scripts/r2-cors.mjs --show   # affiche la politique en place
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const text = readFileSync(resolve(ROOT, "origin/.env"), "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const k of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    if (!env[k]) throw new Error(`Variable manquante dans origin/.env : ${k}`);
  }
  return env;
}

const ORIGINS = [
  "https://vr-cinema-hub.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

// `ExposeHeader ETag` est le point crucial : c'est la seule raison d'être de ce
// fichier. Les autres règles ne font qu'autoriser l'envoi et la lecture.
const CORS_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
  `<CORSRule>` +
  ORIGINS.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join("") +
  `<AllowedMethod>GET</AllowedMethod>` +
  `<AllowedMethod>PUT</AllowedMethod>` +
  `<AllowedMethod>HEAD</AllowedMethod>` +
  `<AllowedHeader>*</AllowedHeader>` +
  `<ExposeHeader>ETag</ExposeHeader>` +
  `<MaxAgeSeconds>3600</MaxAgeSeconds>` +
  `</CORSRule>` +
  `</CORSConfiguration>`;

const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

async function signedRequest({ env, method, query, body, contentType }) {
  const host = new URL(env.R2_ENDPOINT).host;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalUri = `/${env.R2_BUCKET}`;
  const payloadHash = sha256(body ?? "");

  const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headers["content-type"] = contentType;
  // S3 impose un Content-MD5 sur PutBucketCors ; R2 suit la même règle.
  if (body) headers["content-md5"] = createHash("md5").update(body).digest("base64");

  const names = Object.keys(headers).sort();
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  let key = Buffer.from(`AWS4${env.R2_SECRET_ACCESS_KEY}`);
  for (const part of [dateStamp, region, "s3", "aws4_request"]) key = hmac(key, part);
  const signature = hmac(key, stringToSign).toString("hex");

  const out = { ...headers };
  delete out.host;
  out.authorization =
    `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, ` +
    `SignedHeaders=${names.join(";")}, Signature=${signature}`;

  return await fetch(`${env.R2_ENDPOINT}${canonicalUri}?${query}`, { method, headers: out, body });
}

const env = loadEnv();

if (process.argv.includes("--show")) {
  const res = await signedRequest({ env, method: "GET", query: "cors=" });
  console.log(`HTTP ${res.status}`);
  console.log((await res.text()) || "(aucune politique CORS définie)");
  process.exit(res.ok ? 0 : 1);
}

const res = await signedRequest({
  env,
  method: "PUT",
  query: "cors=",
  body: CORS_XML,
  contentType: "application/xml",
});

if (!res.ok) {
  console.error(`Échec : HTTP ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

console.log(`Politique CORS appliquée au bucket « ${env.R2_BUCKET} ».`);
console.log(`Origines autorisées :\n${ORIGINS.map((o) => `  ${o}`).join("\n")}`);
console.log("En-tête ETag exposé au navigateur : les envois multipart peuvent être finalisés.");

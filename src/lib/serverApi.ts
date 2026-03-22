/** Returns true when running inside the Lovable hosted preview (HTTPS, no local proxy) */
export function isLovablePreview(): boolean {
  return (
    window.location.hostname.includes("lovable.app") ||
    window.location.hostname.includes("lovableproject.com")
  );
}

/**
 * serverApi.ts
 * -----------
 * Bridge between the React frontend and the local Node.js sync server.
 *
 * Base URL resolution:
 *   - No baseUrl / empty string → relative `/api/...` (Vite proxy in dev, same-origin in prod)
 *   - baseUrl provided (e.g. https://abc.ngrok.io) → `${baseUrl}/api/...` (for Lovable preview + ngrok)
 *
 * Auth token:
 *   - If `authToken` is provided, it is sent as `X-Auth-Token` header.
 *   - The server checks `VR_AUTH_TOKEN` env var; if not set, auth is disabled.
 */

export type ServerStatus = "checking" | "connected" | "disconnected";

export interface ServerDevice {
  serial: string;
  model: string;
  status: "device" | "offline" | "unauthorized";
  ipAddress: string | null;
}

export interface SyncPayload {
  deviceSerial: string;
  videoStoragePath: string;
  videos: { name: string; sizeGB: number }[];
}

export interface SyncResult {
  pushed: number;
  skipped: number;
  errors: number;
  lines: string[];
}

/** Resolve the API base — empty/undefined means relative /api (proxy) */
function apiBase(baseUrl?: string): string {
  const b = baseUrl?.trim();
  return b ? `${b.replace(/\/$/, "")}/api` : "/api";
}

/** Build fetch options, injecting X-Auth-Token when provided */
function apiFetch(
  url: string,
  opts: RequestInit = {},
  authToken?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (authToken?.trim()) {
    headers["X-Auth-Token"] = authToken.trim();
  }
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...opts, headers });
}

/** Check if the local sync server is reachable */
export async function checkServer(baseUrl?: string, authToken?: string): Promise<ServerStatus> {
  try {
    const res = await apiFetch(`${apiBase(baseUrl)}/health`, {
      signal: AbortSignal.timeout(3000),
    }, authToken);
    return res.ok ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

/** Fetch real ADB devices from the server */
export async function fetchServerDevices(baseUrl?: string, authToken?: string): Promise<ServerDevice[]> {
  const res = await apiFetch(`${apiBase(baseUrl)}/devices`, {}, authToken);
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

/** Trigger a real ADB push sync via the server (legacy, non-streaming) */
export async function pushSync(baseUrl: string | undefined, payload: SyncPayload, authToken?: string): Promise<SyncResult> {
  const res = await apiFetch(`${apiBase(baseUrl)}/sync`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, authToken);
  if (!res.ok) throw new Error("Sync request failed");
  return res.json();
}

/** Get the video file URL */
export function getVideoUrl(baseUrl: string | undefined, videoName: string): string {
  return `${apiBase(baseUrl)}/video/${encodeURIComponent(videoName)}`;
}

/**
 * URL d'une vidéo 360° d'exemple pour le mode démo.
 *
 * En mode démo, les vidéos listées (EscapeRoom_VR_180_SBS_8K.mp4, etc.) sont fictives
 * et n'existent pas sur le disque. Quand le serveur est connecté mais renvoie 404 (fichier
 * introuvable), on utilise cette URL en fallback pour afficher une vraie vidéo 360° et
 * permettre de démontrer le lecteur (y compris le bouton 360°).
 *
 * Source : A-Frame CDN, vidéo de test 360° avec CORS activé.
 */
export const SAMPLE_VIDEO_URL = "https://cdn.aframe.io/360-video-boilerplate/video/city.mp4";

/** Connect a device via Wi-Fi ADB (adb connect IP:PORT) */
export async function connectDevice(ip: string, port = 5555, baseUrl?: string, authToken?: string): Promise<{ success: boolean; output: string; address: string }> {
  const res = await apiFetch(`${apiBase(baseUrl)}/connect`, {
    method: "POST",
    body: JSON.stringify({ ip, port }),
  }, authToken);
  if (!res.ok) throw new Error("Wi-Fi connect failed");
  return res.json();
}

/** Prepare a device for Wi-Fi ADB: runs adb tcpip 5555 on the given serial */
export async function prepareTcpip(serial: string, baseUrl?: string, authToken?: string): Promise<{ success: boolean; output: string }> {
  const res = await apiFetch(`${apiBase(baseUrl)}/tcpip/${encodeURIComponent(serial)}`, {
    method: "POST",
  }, authToken);
  if (!res.ok) throw new Error("adb tcpip failed");
  return res.json();
}

/** Auto-detect Wi-Fi IP of a USB-connected device via adb ip addr */
export async function fetchDeviceIp(serial: string, baseUrl?: string, authToken?: string): Promise<{ ip: string }> {
  const res = await apiFetch(`${apiBase(baseUrl)}/device-ip/${encodeURIComponent(serial)}`, {}, authToken);
  if (!res.ok) throw new Error("Could not detect Wi-Fi IP");
  return res.json();
}

export interface SyncStartResult {
  jobId: string;
}

/** Start an async sync job — returns a jobId immediately */
export async function startSync(
  baseUrl: string | undefined,
  payload: SyncPayload,
  authToken?: string
): Promise<SyncStartResult> {
  const res = await apiFetch(`${apiBase(baseUrl)}/sync/start`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, authToken);
  if (!res.ok) throw new Error("Failed to start sync job");
  return res.json();
}

/**
 * Open an SSE stream for a sync job.
 * Each message is a JSON string: { line: string } | { done: true, summary: SyncResult }
 * Note: EventSource doesn't support custom headers — token is passed as query param.
 */
export function createSyncStream(jobId: string, baseUrl?: string, authToken?: string): EventSource {
  const token = authToken?.trim();
  const base = `${apiBase(baseUrl)}/sync/stream/${encodeURIComponent(jobId)}`;
  const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
  return new EventSource(url);
}

export interface DeviceAdbStatus {
  serial: string;
  battery: number;
  storageUsedGB: number;
  storageTotalGB: number;
  status: string;
}

/** Read real battery + storage from ADB for a connected device */
export async function fetchDeviceStatus(serial: string, baseUrl?: string, authToken?: string): Promise<DeviceAdbStatus> {
  const res = await apiFetch(`${apiBase(baseUrl)}/device-status/${encodeURIComponent(serial)}`, {}, authToken);
  if (!res.ok) throw new Error("Failed to fetch device status");
  return res.json();
}

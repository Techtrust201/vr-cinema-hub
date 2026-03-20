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

/** Check if the local sync server is reachable */
export async function checkServer(baseUrl?: string): Promise<ServerStatus> {
  try {
    const res = await fetch(`${apiBase(baseUrl)}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

/** Fetch real ADB devices from the server */
export async function fetchServerDevices(baseUrl?: string): Promise<ServerDevice[]> {
  const res = await fetch(`${apiBase(baseUrl)}/devices`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

/** Trigger a real ADB push sync via the server */
export async function pushSync(baseUrl: string | undefined, payload: SyncPayload): Promise<SyncResult> {
  const res = await fetch(`${apiBase(baseUrl)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Sync request failed");
  return res.json();
}

/** Get the video file URL */
export function getVideoUrl(baseUrl: string | undefined, videoName: string): string {
  return `${apiBase(baseUrl)}/video/${encodeURIComponent(videoName)}`;
}

/** Connect a device via Wi-Fi ADB (adb connect IP:PORT) */
export async function connectDevice(ip: string, port = 5555, baseUrl?: string): Promise<{ success: boolean; output: string; address: string }> {
  const res = await fetch(`${apiBase(baseUrl)}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip, port }),
  });
  if (!res.ok) throw new Error("Wi-Fi connect failed");
  return res.json();
}

export interface DeviceAdbStatus {
  serial: string;
  battery: number;
  storageUsedGB: number;
  storageTotalGB: number;
  status: string;
}

/** Read real battery + storage from ADB for a connected device */
export async function fetchDeviceStatus(serial: string, baseUrl?: string): Promise<DeviceAdbStatus> {
  const res = await fetch(`${apiBase(baseUrl)}/device-status/${encodeURIComponent(serial)}`);
  if (!res.ok) throw new Error("Failed to fetch device status");
  return res.json();
}

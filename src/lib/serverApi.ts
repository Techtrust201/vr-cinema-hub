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
 * All requests use RELATIVE paths (/api/...) so they work:
 *   - In dev:  Vite proxies /api/* → http://localhost:3001  (no mixed-content block)
 *   - In prod: Express serves the React build AND handles /api/* on the same port
 *
 * The `serverUrl` parameter is kept for backward-compat but is no longer used
 * for the actual fetch — the proxy / same-origin routing handles it.
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

/** Check if the local sync server is reachable via the Vite proxy */
export async function checkServer(_serverUrl?: string): Promise<ServerStatus> {
  try {
    const res = await fetch("/api/health", {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

/** Fetch real ADB devices from the server */
export async function fetchServerDevices(_serverUrl?: string): Promise<ServerDevice[]> {
  const res = await fetch("/api/devices");
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

/** Trigger a real ADB push sync via the server */
export async function pushSync(_serverUrl: string | undefined, payload: SyncPayload): Promise<SyncResult> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Sync request failed");
  return res.json();
}

/** Get the video file URL — relative so it works both in dev (proxy) and prod (same origin) */
export function getVideoUrl(_serverUrl: string | undefined, videoName: string): string {
  return `/api/video/${encodeURIComponent(videoName)}`;
}

/** Connect a device via Wi-Fi ADB (adb connect IP:PORT) */
export async function connectDevice(ip: string, port = 5555): Promise<{ success: boolean; output: string; address: string }> {
  const res = await fetch("/api/connect", {
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
export async function fetchDeviceStatus(serial: string): Promise<DeviceAdbStatus> {
  const res = await fetch(`/api/device-status/${encodeURIComponent(serial)}`);
  if (!res.ok) throw new Error("Failed to fetch device status");
  return res.json();
}

/**
 * serverApi.ts
 * -----------
 * Bridge between the React frontend and the optional local Node.js sync server.
 *
 * When the server is running (node server/sync-server.js), real ADB operations
 * are performed. Otherwise, the app falls back to simulation mode.
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

/** Check if the local sync server is reachable */
export async function checkServer(serverUrl: string): Promise<ServerStatus> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

/** Fetch real ADB devices from the server */
export async function fetchServerDevices(serverUrl: string): Promise<ServerDevice[]> {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/devices`);
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

/** Trigger a real ADB push sync via the server */
export async function pushSync(serverUrl: string, payload: SyncPayload): Promise<SyncResult> {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Sync request failed");
  return res.json();
}

/** Get the video file URL served by the local server */
export function getVideoUrl(serverUrl: string, videoName: string): string {
  return `${serverUrl.replace(/\/$/, "")}/video/${encodeURIComponent(videoName)}`;
}

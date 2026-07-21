/** Resolve a Storage-safe video Content-Type from filename when browser File.type is wrong. */
const EXT_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

export function resolveVideoContentType(file: File): string {
  const typed = (file.type || "").trim().toLowerCase();
  if (typed.startsWith("video/") && typed !== "application/octet-stream") {
    return typed;
  }
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return typed || "application/octet-stream";
  const ext = name.slice(dot).toLowerCase();
  return EXT_MIME[ext] ?? typed || "application/octet-stream";
}

/** Sanitize storage object basename without changing the display title. */
export function sanitizeStorageFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function isMovLike(file: File): boolean {
  const n = (file.name || "").toLowerCase();
  return n.endsWith(".mov") || resolveVideoContentType(file) === "video/quicktime";
}

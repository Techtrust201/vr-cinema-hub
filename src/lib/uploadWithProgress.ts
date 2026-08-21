import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

/**
 * Uploads a file to Storage while reporting real byte-level progress.
 *
 * supabase.storage.upload() exposes no progress events, so the previous UI faked
 * it by jumping 0 → 95 → 100 %: on a multi-gigabyte VR video the bar sat at 0 %
 * for the entire transfer and looked like a freeze. A signed upload URL driven by
 * XMLHttpRequest gives genuine `upload.onprogress` events, and the browser
 * streams the file from disk instead of buffering it in memory.
 *
 * Falls back to the SDK path (correct, just progress-less) if a signed URL cannot
 * be obtained, so upload reliability never depends on this optimisation.
 */
export async function uploadFileWithProgress(options: {
  bucket: string;
  path: string;
  file: File;
  contentType: string;
  /** Seconds, as accepted by Storage's cacheControl. */
  cacheControl?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    bucket,
    path,
    file,
    contentType,
    cacheControl = "3600",
    onProgress,
    signal,
  } = options;

  if (signal?.aborted) throw new DOMException("Upload annulé", "AbortError");

  const signed = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  const signedUrl = signed.data?.signedUrl;

  if (signed.error || !signedUrl) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl, upsert: false, contentType });
    if (error) throw error;
    onProgress?.(1);
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", `max-age=${cacheControl}`);
    xhr.setRequestHeader("x-upsert", "false");
    if (SUPABASE_PUBLISHABLE_KEY) xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    if (accessToken) xhr.setRequestHeader("authorization", `Bearer ${accessToken}`);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      let message = `Échec du transfert (HTTP ${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? message;
      } catch {
        // Non-JSON error body: keep the status-based message.
      }
      reject(new Error(message));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Transfert interrompu — vérifiez votre connexion."));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("Transfert expiré."));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Upload annulé", "AbortError"));
    };

    xhr.send(file);
  });
}

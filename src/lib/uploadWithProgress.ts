import { Upload } from "tus-js-client";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

/** Seuil officiel Supabase : au-delà, un PUT unique est fragile. Le chunk TUS doit rester 6 Mo. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

function resumableEndpoint(): string {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}

/**
 * Envoie un fichier vers Storage avec une vraie barre de progression.
 *
 * Les films VR pèsent des centaines de mégaoctets : un PUT unique expire ou coupe
 * la connexion. Au-delà de 6 Mo on passe par TUS (reprisable, par paquets de 6 Mo).
 * En dessous, une URL signée + XHR suffit (miniatures, petits tests).
 */
export async function uploadFileWithProgress(options: {
  bucket: string;
  path: string;
  file: File;
  contentType: string;
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

  if (file.size >= TUS_CHUNK_BYTES) {
    await uploadResumable({ bucket, path, file, contentType, cacheControl, onProgress, signal });
    return;
  }

  await uploadSignedPut({ bucket, path, file, contentType, cacheControl, onProgress, signal });
}

async function uploadResumable(options: {
  bucket: string;
  path: string;
  file: File;
  contentType: string;
  cacheControl: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Session expirée — reconnectez-vous pour envoyer la vidéo.");

  const { bucket, path, file, contentType, cacheControl, onProgress, signal } = options;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: TUS_CHUNK_BYTES,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl,
      },
      onError: (error) => reject(error),
      onProgress: (sent, total) => {
        if (total > 0) onProgress?.(sent / total);
      },
      onSuccess: () => {
        onProgress?.(1);
        resolve();
      },
    });

    const onAbort = () => {
      void upload.abort(true).then(
        () => reject(new DOMException("Upload annulé", "AbortError")),
        reject,
      );
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    void upload.findPreviousUploads().then((previous) => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, reject);
  });
}

async function uploadSignedPut(options: {
  bucket: string;
  path: string;
  file: File;
  contentType: string;
  cacheControl: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { bucket, path, file, contentType, cacheControl, onProgress, signal } = options;

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

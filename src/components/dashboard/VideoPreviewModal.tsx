import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { X, Film, Calendar, Clock, HardDrive, Eye, Play, Pause, Monitor, Copy, Check, Loader2, WifiOff, Globe, LayoutTemplate, Smartphone } from "lucide-react";
import { Video } from "@/store/vrStore";
import { useVRStore } from "@/store/vrStore";
import { cn } from "@/lib/utils";
import { checkServer, getVideoUrl, ServerStatus } from "@/lib/serverApi";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ─── Gyroscope controls (inside Canvas, uses useThree) ────────────────────────
function GyroControls({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;

      const screenAngle = (window.screen?.orientation?.angle ?? 0) * (Math.PI / 180);

      const alpha = THREE.MathUtils.degToRad(e.alpha);
      const beta  = THREE.MathUtils.degToRad(e.beta);
      const gamma = THREE.MathUtils.degToRad(e.gamma);

      // Device orientation → camera quaternion (ZXY convention)
      const euler = new THREE.Euler(beta, alpha, -gamma, "YXZ");
      const q = new THREE.Quaternion().setFromEuler(euler);

      // Correct for screen rotation (portrait vs landscape)
      const screenQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -screenAngle
      );
      camera.quaternion.multiplyQuaternions(q, screenQ);
    };

    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, [enabled, camera]);

  return null;
}

// ─── 360° sphere component ────────────────────────────────────────────────────
function VideoSphere({ videoEl }: { videoEl: HTMLVideoElement }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useRef<THREE.VideoTexture | null>(null);

  useEffect(() => {
    const tex = new THREE.VideoTexture(videoEl);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBAFormat;
    texture.current = tex;
    return () => {
      tex.dispose();
    };
  }, [videoEl]);

  // Only update the texture flag — R3F handles the render loop automatically
  useFrame(() => {
    if (texture.current) texture.current.needsUpdate = true;
  });

  if (!texture.current) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[5, 64, 40]} />
      <meshBasicMaterial map={texture.current} side={THREE.BackSide} />
    </mesh>
  );
}

interface VR360CanvasProps {
  videoEl: HTMLVideoElement;
  gyroEnabled: boolean;
}

function VR360Canvas({ videoEl, gyroEnabled }: VR360CanvasProps) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ fov: 75, near: 0.1, far: 20, position: [0, 0, 0.01] }}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <VideoSphere videoEl={videoEl} />
      </Suspense>
      {/* Gyro controls replace orbit on mobile when enabled */}
      <GyroControls enabled={gyroEnabled} />
      {!gyroEnabled && (
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          rotateSpeed={-0.4}
          autoRotate={false}
          reverseOrbit={false}
        />
      )}
    </Canvas>
  );
}

// ─── Helpers & constants ──────────────────────────────────────────────────────

interface VideoPreviewModalProps {
  video: Video;
  onClose: () => void;
}

const formatBadge: Record<string, string> = {
  "360": "bg-[hsl(var(--vr-violet)_/_0.18)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.35)]",
  "180": "bg-[hsl(var(--vr-cyan)_/_0.18)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.35)]",
};

const stereoBadge: Record<string, string> = {
  mono: "bg-muted text-muted-foreground border-border",
  sbs: "bg-[hsl(50_80%_50%_/_0.15)] text-[hsl(50_80%_60%)] border-[hsl(50_80%_50%_/_0.3)]",
  ou: "bg-[hsl(200_80%_50%_/_0.15)] text-[hsl(200_80%_65%)] border-[hsl(200_80%_50%_/_0.3)]",
};

const stereoLabel: Record<string, string> = {
  mono: "Monoscopic",
  sbs: "Side-by-Side (3D)",
  ou: "Over-Under (3D)",
};

function parseDuration(dur: string): number {
  if (!dur || dur === "—") return 0;
  const parts = dur.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const resolutionInfo: Record<string, { label: string; detail: string; colorClass: string; iconClass: string }> = {
  "360": {
    label: "4K",
    detail: "3840 × 2160",
    colorClass: "text-[hsl(var(--vr-cyan))]",
    iconClass: "bg-[hsl(var(--vr-cyan)_/_0.1)] border-[hsl(var(--vr-cyan)_/_0.25)]",
  },
  "180": {
    label: "8K",
    detail: "7680 × 4320",
    colorClass: "text-[hsl(var(--vr-violet))]",
    iconClass: "bg-[hsl(var(--vr-violet)_/_0.1)] border-[hsl(var(--vr-violet)_/_0.25)]",
  },
};

// Detect if device has a gyroscope
const hasGyro = typeof window !== "undefined" && "DeviceOrientationEvent" in window;

export default function VideoPreviewModal({ video, onClose }: VideoPreviewModalProps) {
  const { settings } = useVRStore();
  const totalSecs = parseDuration(video.duration);

  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [mode360, setMode360] = useState(false);
  const [gyroEnabled, setGyroEnabled] = useState(false);

  // HTML5 video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, setVideoState] = useState<"loading" | "ready" | "error">("loading");
  const [realPlaying, setRealPlaying] = useState(false);
  const [realProgress, setRealProgress] = useState(0);
  const [realCurrentSecs, setRealCurrentSecs] = useState(0);
  const [realDuration, setRealDuration] = useState(0);

  // Simulated playback state
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkServer(settings.serverUrl).then(setServerStatus);
  }, [settings.serverUrl]);

  // Reset 360 mode when disconnected
  useEffect(() => {
    if (serverStatus !== "connected") setMode360(false);
  }, [serverStatus]);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (serverStatus === "connected") return;
    if (playing) {
      const totalMs = Math.max(totalSecs * 1000, 1000);
      const step = (300 / totalMs) * 100;
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev + step;
          return next >= 100 ? 0 : next;
        });
      }, 300);
    } else {
      clearTick();
    }
    return clearTick;
  }, [playing, totalSecs, clearTick, serverStatus]);

  useEffect(() => () => clearTick(), [clearTick]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setRealCurrentSecs(v.currentTime);
    setRealDuration(v.duration || 0);
    setRealProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
  };

  const handleVideoEnded = () => {
    setRealPlaying(false);
    setRealProgress(0);
    setRealCurrentSecs(0);
  };

  const toggleRealPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (realPlaying) {
      v.pause();
      setRealPlaying(false);
    } else {
      v.play();
      setRealPlaying(true);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(100, Math.max(0, pct));
    if (serverStatus === "connected" && videoRef.current && realDuration) {
      videoRef.current.currentTime = (clamped / 100) * realDuration;
    } else {
      setProgress(clamped);
    }
  };

  const simCurrentSecs = (progress / 100) * totalSecs;
  const filePath = `${settings.videoStoragePath.replace(/\/$/, "")}/${video.name}`;
  const res = resolutionInfo[video.format];

  const handleCopy = () => {
    navigator.clipboard.writeText(filePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const isConnected = serverStatus === "connected";
  const isChecking = serverStatus === "checking";

  const displayProgress = isConnected ? realProgress : progress;
  const displayCurrentSecs = isConnected ? realCurrentSecs : simCurrentSecs;
  const displayPlaying = isConnected ? realPlaying : playing;
  const displayDuration = isConnected && realDuration > 0
    ? formatSeconds(realDuration)
    : video.duration === "—" ? "—" : video.duration;

  const canToggle360 = isConnected && videoState === "ready";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full mx-4 rounded-2xl border border-[hsl(var(--vr-violet)_/_0.25)] bg-[hsl(var(--vr-surface))] shadow-[0_0_60px_hsl(var(--vr-violet)_/_0.18)] overflow-hidden animate-fade-in-up transition-all duration-300",
          mode360 ? "max-w-3xl" : "max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Film size={15} className="text-[hsl(var(--vr-violet))] shrink-0" />
            <span className="text-sm font-medium truncate">{video.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {/* Server status chip */}
            {!isChecking && (
              <span className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border",
                isConnected
                  ? "bg-[hsl(140_70%_40%_/_0.12)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_40%_/_0.3)]"
                  : "bg-muted/40 text-muted-foreground/60 border-border/40"
              )}>
                {isConnected ? (
                  <><span className="w-1.5 h-1.5 rounded-full bg-[hsl(140_70%_55%)]" /> Serveur</>
                ) : (
                  <><WifiOff size={9} /> Démo</>
                )}
              </span>
            )}

            {/* 360° / Flat toggle — only visible when video is ready */}
            {canToggle360 && (
              <button
                onClick={() => {
                  setMode360((v) => !v);
                  if (mode360) setGyroEnabled(false); // reset gyro when leaving 360
                }}
                title={mode360 ? "Passer en mode plat" : "Passer en mode 360° immersif"}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 active:scale-95",
                  mode360
                    ? "bg-[hsl(var(--vr-violet)_/_0.2)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.45)]"
                    : "bg-muted/50 text-muted-foreground border-border/50 hover:text-foreground hover:bg-muted/80"
                )}
              >
                {mode360 ? <LayoutTemplate size={12} /> : <Globe size={12} />}
                {mode360 ? "Plat" : "360°"}
              </button>
            )}

            {/* Gyroscope toggle — only in 360° mode on devices with gyro */}
            {canToggle360 && mode360 && hasGyro && (
              <button
                onClick={async () => {
                  if (gyroEnabled) {
                    setGyroEnabled(false);
                    return;
                  }
                  // iOS 13+ requires permission request
                  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
                  if (typeof DOE.requestPermission === "function") {
                    const perm = await DOE.requestPermission();
                    if (perm === "granted") setGyroEnabled(true);
                  } else {
                    setGyroEnabled(true);
                  }
                }}
                title={gyroEnabled ? "Désactiver le gyroscope" : "Activer le gyroscope (orienter le téléphone)"}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 active:scale-95",
                  gyroEnabled
                    ? "bg-[hsl(var(--vr-cyan)_/_0.2)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.45)]"
                    : "bg-muted/50 text-muted-foreground border-border/50 hover:text-foreground hover:bg-muted/80"
                )}
              >
                <Smartphone size={12} />
                {gyroEnabled ? "Gyro ON" : "Gyro"}
              </button>
            )}

            {/* Copy path button */}
            <button
              onClick={handleCopy}
              title={filePath}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200",
                copied
                  ? "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_40%_/_0.35)]"
                  : "bg-muted/50 text-muted-foreground border-border/50 hover:text-foreground hover:bg-muted/80"
              )}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copié !" : "Chemin"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="relative bg-background/60 border-b border-border/40">
          <div className="aspect-video flex flex-col items-center justify-center gap-3 relative overflow-hidden">
            {/* Decorative grid (hidden in 360 mode) */}
            {!mode360 && (
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(hsl(var(--vr-violet)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--vr-violet)) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
            )}

            {/* Checking overlay */}
            {isChecking && (
              <div className="relative z-10 flex flex-col items-center gap-3">
                <Loader2 size={28} className="text-[hsl(var(--vr-violet)_/_0.5)] animate-spin" />
                <p className="text-xs text-muted-foreground/60">Vérification du serveur…</p>
              </div>
            )}

            {/* ── REAL VIDEO (server connected) ── */}
            {isConnected && (
              <>
                {/* Hidden video element — always mounted so texture & controls work */}
                <video
                  ref={videoRef}
                  src={getVideoUrl(settings.serverUrl, video.name)}
                  className={cn(
                    "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
                    videoState === "ready" && !mode360 ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                  onLoadedData={() => setVideoState("ready")}
                  onError={() => setVideoState("error")}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                  preload="metadata"
                  crossOrigin="anonymous"
                />

                {/* 360° Three.js canvas */}
                {mode360 && videoState === "ready" && videoRef.current && (
                  <div className="absolute inset-0 z-10">
                    <VR360Canvas videoEl={videoRef.current} />
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm border border-white/10">
                      🖱 Glissez pour regarder autour
                    </div>
                  </div>
                )}

                {/* Loading overlay */}
                {videoState === "loading" && (
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <Loader2 size={28} className="text-[hsl(var(--vr-violet)_/_0.6)] animate-spin" />
                    <p className="text-xs text-muted-foreground/60">Chargement du fichier…</p>
                  </div>
                )}

                {/* Error overlay */}
                {videoState === "error" && (
                  <div className="relative z-10 flex flex-col items-center gap-3 text-center px-6">
                    <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                      <Film size={28} className="text-destructive/40" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground/80">Fichier introuvable sur le serveur</p>
                      <p className="text-[11px] text-muted-foreground/40 mt-0.5 font-mono">{video.name}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── DEMO PLACEHOLDER ── */}
            {!isChecking && !isConnected && (
              <>
                <div className="relative z-10 w-20 h-20 rounded-2xl bg-[hsl(var(--vr-violet)_/_0.1)] border border-[hsl(var(--vr-violet)_/_0.2)] flex items-center justify-center">
                  <Film size={32} className="text-[hsl(var(--vr-violet)_/_0.5)]" />
                </div>
                <div className="relative z-10 text-center space-y-1">
                  <p className="text-xs text-muted-foreground/70 font-medium">Aperçu non disponible</p>
                  <p className="text-[11px] text-muted-foreground/40">
                    Démarrez le serveur local pour lire
                  </p>
                </div>
              </>
            )}

            {/* Format pill */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", formatBadge[video.format])}>
                {video.format}°
              </span>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase", stereoBadge[video.stereo])}>
                {video.stereo}
              </span>
            </div>
          </div>

          {/* Timeline controls */}
          {!isChecking && !mode360 && (
            <div className="px-5 pb-4 pt-2 space-y-2">
              <div
                className="relative h-1.5 rounded-full bg-border/50 cursor-pointer overflow-hidden group"
                onClick={handleProgressClick}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-[hsl(var(--vr-violet))] transition-all duration-150"
                  style={{
                    width: `${displayProgress}%`,
                    boxShadow: displayPlaying ? "0 0 8px hsl(var(--vr-violet) / 0.6)" : "none",
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={isConnected ? toggleRealPlay : () => setPlaying((p) => !p)}
                  disabled={isConnected && (videoState === "loading" || videoState === "error")}
                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-[hsl(var(--vr-violet)_/_0.15)] border border-[hsl(var(--vr-violet)_/_0.35)] hover:bg-[hsl(var(--vr-violet)_/_0.25)] disabled:opacity-30 transition-colors text-[hsl(var(--vr-violet))]"
                >
                  {displayPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {formatSeconds(displayCurrentSecs)}
                  <span className="text-muted-foreground/40 mx-1">/</span>
                  {displayDuration}
                </span>
                {displayPlaying && (
                  <span className="ml-auto text-[10px] font-medium text-[hsl(var(--vr-violet)_/_0.7)] animate-pulse">
                    ● EN COURS
                  </span>
                )}
                {isConnected && videoState === "ready" && !displayPlaying && (
                  <span className="ml-auto text-[10px] text-[hsl(140_70%_55%_/_0.7)] font-medium">
                    ● Prêt
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Controls in 360° mode */}
          {mode360 && isConnected && videoState === "ready" && (
            <div className="px-5 pb-3 pt-2 flex items-center gap-3">
              <button
                onClick={toggleRealPlay}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-[hsl(var(--vr-violet)_/_0.15)] border border-[hsl(var(--vr-violet)_/_0.35)] hover:bg-[hsl(var(--vr-violet)_/_0.25)] transition-colors text-[hsl(var(--vr-violet))]"
              >
                {realPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                {formatSeconds(realCurrentSecs)} / {displayDuration}
              </span>
              {realPlaying && (
                <span className="ml-auto text-[10px] font-medium text-[hsl(var(--vr-violet)_/_0.7)] animate-pulse">
                  ● EN COURS
                </span>
              )}
            </div>
          )}
        </div>

        {/* Metadata grid */}
        <div className="p-5 grid grid-cols-2 gap-3">
          {[
            {
              icon: <Eye size={13} className="text-[hsl(var(--vr-violet))]" />,
              label: "Format",
              value: `${video.format}° — ${video.format === "360" ? "Sphérique" : "Semi-sphérique"}`,
            },
            {
              icon: <Film size={13} className="text-[hsl(var(--vr-cyan))]" />,
              label: "Stéréoscopie",
              value: stereoLabel[video.stereo] ?? video.stereo.toUpperCase(),
            },
            {
              icon: <Clock size={13} className="text-muted-foreground" />,
              label: "Durée",
              value: video.duration === "—" ? "Inconnue" : video.duration,
            },
            {
              icon: <HardDrive size={13} className="text-muted-foreground" />,
              label: "Taille",
              value: `${video.sizeGB.toFixed(2)} GB`,
            },
            {
              icon: <Monitor size={13} className={res.colorClass} />,
              label: "Résolution estimée",
              value: `${res.label} — ${res.detail}`,
              valueClass: res.colorClass,
            },
            {
              icon: <Calendar size={13} className="text-muted-foreground" />,
              label: "Ajouté le",
              value: video.addedAt,
            },
          ].map(({ icon, label, value, valueClass }) => (
            <div
              key={label}
              className="rounded-xl bg-background/50 border border-border/40 px-3.5 py-3 space-y-1"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-medium">
                {icon}
                {label}
              </div>
              <p className={cn("text-sm font-medium tabular-nums", valueClass)}>{value}</p>
            </div>
          ))}
        </div>

        {/* File path footer */}
        <div className="px-5 pb-5 -mt-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/40 border border-border/30">
            <span className="text-[10px] text-muted-foreground/50 shrink-0 font-mono uppercase tracking-wider">Chemin</span>
            <span className="text-[11px] text-muted-foreground/70 font-mono truncate flex-1">{filePath}</span>
            <button onClick={handleCopy} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              {copied ? <Check size={11} className="text-[hsl(140_70%_55%)]" /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

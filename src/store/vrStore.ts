import { create } from "zustand";
import { persist } from "zustand/middleware";

export type VideoFormat = "360" | "180";
export type StereoMode = "mono" | "sbs" | "ou";
export type LibraryType = "location" | "animations";
export type DeviceStatus = "connected" | "disconnected" | "syncing";

export interface Video {
  id: string;
  name: string;
  format: VideoFormat;
  stereo: StereoMode;
  sizeGB: number;
  duration: string;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  videos: Video[];
}

export interface Library {
  id: LibraryType;
  name: string;
  playlists: Playlist[];
}

export interface Device {
  id: string;
  serial: string;
  name: string;
  type: LibraryType;
  status: DeviceStatus;
  storageUsedGB: number;
  storageTotalGB: number;
  battery: number;
  lastSyncAt: string | null;
  ipAddress: string | null;
}

export interface SyncLog {
  id: string;
  at: string;
  library: LibraryType;
  deviceIds: string[];
  videosTotal: number;
  videosPushed: number;
  videosSkipped: number;
  status: "success" | "error" | "running";
  lines: string[];
}

export interface VRSettings {
  videoStoragePath: string;
  maxUploadGB: number;
  authToken: string;
  serverUrl: string;
  /** Public tunnel URL (e.g. https://abc.ngrok.io) — used when running from Lovable preview */
  publicServerUrl: string;
  /** true = demo/simulation mode (no real ADB server required) */
  demoMode: boolean;
}

const DEFAULT_SETTINGS: VRSettings = {
  videoStoragePath: "/videos/vr-ultimate",
  maxUploadGB: 10,
  authToken: "",
  serverUrl: "http://localhost:3001",
  publicServerUrl: "",
  demoMode: true,
};

// ─── Demo data ──────────────────────────────────────────────────────────────

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const DEMO_LIBRARIES: Library[] = [
  {
    id: "location",
    name: "Location",
    playlists: [
      {
        id: "pl-loc-01",
        name: "Paris — Cathédrale Notre-Dame",
        videos: [
          {
            id: "v-loc-01",
            name: "Notre-Dame_Reconstruction_360_4K.mp4",
            format: "360",
            stereo: "mono",
            sizeGB: 3.8,
            duration: "08:24",
            addedAt: daysAgo(18),
          },
          {
            id: "v-loc-02",
            name: "Notre-Dame_Exterieur_360_4K.mp4",
            format: "360",
            stereo: "mono",
            sizeGB: 2.4,
            duration: "05:10",
            addedAt: daysAgo(15),
          },
          {
            id: "v-loc-03",
            name: "Notre-Dame_Nef_360_SBS.mp4",
            format: "360",
            stereo: "sbs",
            sizeGB: 5.1,
            duration: "11:38",
            addedAt: daysAgo(10),
          },
        ],
      },
      {
        id: "pl-loc-02",
        name: "New York — Times Square",
        videos: [
          {
            id: "v-loc-04",
            name: "NYC_TimesSquare_360_SBS_Day.mp4",
            format: "360",
            stereo: "sbs",
            sizeGB: 4.2,
            duration: "09:15",
            addedAt: daysAgo(7),
          },
          {
            id: "v-loc-05",
            name: "NYC_TimesSquare_180_OU_Night.mp4",
            format: "180",
            stereo: "ou",
            sizeGB: 6.7,
            duration: "14:52",
            addedAt: daysAgo(5),
          },
        ],
      },
    ],
  },
  {
    id: "animations",
    name: "Animations",
    playlists: [
      {
        id: "pl-anim-01",
        name: "Expériences Interactives",
        videos: [
          {
            id: "v-anim-01",
            name: "EscapeRoom_VR_180_SBS_8K.mp4",
            format: "180",
            stereo: "sbs",
            sizeGB: 8.3,
            duration: "22:05",
            addedAt: daysAgo(20),
          },
          {
            id: "v-anim-02",
            name: "SpaceWalk_NASA_180_OU_8K.mp4",
            format: "180",
            stereo: "ou",
            sizeGB: 7.9,
            duration: "18:47",
            addedAt: daysAgo(12),
          },
        ],
      },
      {
        id: "pl-anim-02",
        name: "Visites Guidées",
        videos: [
          {
            id: "v-anim-03",
            name: "Louvre_VigilDesNuits_360_Mono.mp4",
            format: "360",
            stereo: "mono",
            sizeGB: 3.1,
            duration: "07:33",
            addedAt: daysAgo(8),
          },
          {
            id: "v-anim-04",
            name: "ISS_Station_Orbitale_360_Mono.mp4",
            format: "360",
            stereo: "mono",
            sizeGB: 4.6,
            duration: "12:20",
            addedAt: daysAgo(3),
          },
        ],
      },
    ],
  },
];

/**
 * Liste des noms de fichiers des vidéos de démo (fictives).
 * Utilisée pour savoir quand utiliser la vidéo d'exemple en fallback :
 * si le fichier n'existe pas sur le serveur ET que c'est une vidéo de démo,
 * on charge une vidéo 360° d'exemple pour que la démo fonctionne.
 */
export const DEMO_VIDEO_NAMES = new Set(
  DEMO_LIBRARIES.flatMap((lib) => lib.playlists.flatMap((p) => p.videos.map((v) => v.name)))
);

export const DEMO_DEVICES: Device[] = [
  {
    id: "dev-quest-pro-01",
    serial: "3A4F8B2C1D9E0F5A",
    name: "Quest Pro — Salle A",
    type: "location",
    status: "connected",
    storageUsedGB: 87.3,
    storageTotalGB: 128,
    battery: 72,
    lastSyncAt: daysAgo(2),
    ipAddress: "192.168.1.101",
  },
  {
    id: "dev-quest3-studio",
    serial: "7E2A9C4B6F1D3E8A",
    name: "Quest 3 — Studio Animations",
    type: "animations",
    status: "connected",
    storageUsedGB: 44.8,
    storageTotalGB: 256,
    battery: 91,
    lastSyncAt: daysAgo(10),
    ipAddress: "192.168.1.102",
  },
  {
    id: "dev-quest2-demo",
    serial: "1B3D5F7A9C2E4B6H",
    name: "Quest 2 — Démo Clients",
    type: "location",
    status: "disconnected",
    storageUsedGB: 62.1,
    storageTotalGB: 128,
    battery: 34,
    lastSyncAt: null,
    ipAddress: "192.168.1.103",
  },
];

export const DEMO_SYNC_LOGS: SyncLog[] = [
  {
    id: "sync-log-01",
    at: daysAgo(0.4), // ~10 hours ago
    library: "location",
    deviceIds: ["dev-quest-pro-01"],
    videosTotal: 7,
    videosPushed: 5,
    videosSkipped: 2,
    status: "success",
    lines: [
      "🔍 Connexion à Quest Pro — Salle A (192.168.1.101)…",
      "✓ Appareil détecté : 3A4F8B2C1D9E0F5A",
      "📂 Chemin cible : /sdcard/Movies/VR_Ultimate/",
      "→ Notre-Dame_Reconstruction_360_4K.mp4 — déjà présent, skip",
      "→ Notre-Dame_Exterieur_360_4K.mp4 — déjà présent, skip",
      "✓ Notre-Dame_Nef_360_SBS.mp4 [5.1 GB] — 100%",
      "✓ NYC_TimesSquare_360_SBS_Day.mp4 [4.2 GB] — 100%",
      "✓ NYC_TimesSquare_180_OU_Night.mp4 [6.7 GB] — 100%",
      "✓ EscapeRoom_VR_180_SBS_8K.mp4 [8.3 GB] — 100%",
      "✓ SpaceWalk_NASA_180_OU_8K.mp4 [7.9 GB] — 100%",
      "✅ Sync terminée — 5 fichiers poussés, 2 ignorés. Durée : 4m 17s",
    ],
  },
  {
    id: "sync-log-02",
    at: daysAgo(3),
    library: "animations",
    deviceIds: ["dev-quest3-studio"],
    videosTotal: 4,
    videosPushed: 3,
    videosSkipped: 1,
    status: "success",
    lines: [
      "🔍 Connexion à Quest 3 — Studio Animations (192.168.1.102)…",
      "✓ Appareil détecté : 7E2A9C4B6F1D3E8A",
      "📂 Chemin cible : /sdcard/Movies/VR_Ultimate/",
      "→ EscapeRoom_VR_180_SBS_8K.mp4 — déjà présent, skip",
      "✓ SpaceWalk_NASA_180_OU_8K.mp4 [7.9 GB] — 100%",
      "✓ Louvre_VigilDesNuits_360_Mono.mp4 [3.1 GB] — 100%",
      "✓ ISS_Station_Orbitale_360_Mono.mp4 [4.6 GB] — 100%",
      "✅ Sync terminée — 3 fichiers poussés, 1 ignoré. Durée : 2m 48s",
    ],
  },
  {
    id: "sync-log-03",
    at: daysAgo(5),
    library: "location",
    deviceIds: ["dev-quest2-demo"],
    videosTotal: 5,
    videosPushed: 2,
    videosSkipped: 0,
    status: "error",
    lines: [
      "🔍 Connexion à Quest 2 — Démo Clients (192.168.1.103)…",
      "✓ Appareil détecté : 1B3D5F7A9C2E4B6H",
      "📂 Chemin cible : /sdcard/Movies/VR_Ultimate/",
      "✓ Notre-Dame_Reconstruction_360_4K.mp4 [3.8 GB] — 100%",
      "✓ Notre-Dame_Exterieur_360_4K.mp4 [2.4 GB] — 100%",
      "→ Notre-Dame_Nef_360_SBS.mp4 — transfert en cours… 47%",
      "Erreur : connexion USB perdue (LIBUSB_ERROR_IO)",
      "Erreur : sync interrompue — 2 fichiers transférés sur 5",
    ],
  },
  {
    id: "sync-log-04",
    at: daysAgo(14),
    library: "location",
    deviceIds: ["dev-quest-pro-01"],
    videosTotal: 7,
    videosPushed: 7,
    videosSkipped: 0,
    status: "success",
    lines: [
      "🔍 Connexion à Quest Pro — Salle A (192.168.1.101)…",
      "✓ Appareil détecté : 3A4F8B2C1D9E0F5A",
      "📂 Chemin cible : /sdcard/Movies/VR_Ultimate/",
      "✓ Notre-Dame_Reconstruction_360_4K.mp4 [3.8 GB] — 100%",
      "✓ Notre-Dame_Exterieur_360_4K.mp4 [2.4 GB] — 100%",
      "✓ Notre-Dame_Nef_360_SBS.mp4 [5.1 GB] — 100%",
      "✓ NYC_TimesSquare_360_SBS_Day.mp4 [4.2 GB] — 100%",
      "✓ NYC_TimesSquare_180_OU_Night.mp4 [6.7 GB] — 100%",
      "✓ EscapeRoom_VR_180_SBS_8K.mp4 [8.3 GB] — 100%",
      "✓ SpaceWalk_NASA_180_OU_8K.mp4 [7.9 GB] — 100%",
      "✅ Sync complète — 7 fichiers poussés. Durée : 8m 03s",
    ],
  },
];

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType = "sync_done" | "sync_error" | "info";

export interface AppNotification {
  id: string;
  at: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
}

// ─── Empty libraries skeleton (Mode Réel — pas de fake data) ─────────────────

export const EMPTY_LIBRARIES: Library[] = [
  { id: "location", name: "Location", playlists: [] },
  { id: "animations", name: "Animations", playlists: [] },
];

// ─── Store ───────────────────────────────────────────────────────────────────

interface VRStore {
  libraries: Library[];
  devices: Device[];
  syncLogs: SyncLog[];
  notifications: AppNotification[];
  settings: VRSettings;
  // Playlist actions
  addPlaylist: (libraryId: LibraryType, name: string) => void;
  removePlaylist: (libraryId: LibraryType, playlistId: string) => void;
  renamePlaylist: (libraryId: LibraryType, playlistId: string, newName: string) => void;
  // Video actions
  addVideo: (libraryId: LibraryType, playlistId: string, video: Video) => void;
  removeVideo: (libraryId: LibraryType, playlistId: string, videoId: string) => void;
  updateVideo: (libraryId: LibraryType, playlistId: string, videoId: string, updates: Partial<Pick<Video, "format" | "stereo" | "name">>) => void;
  // Device actions
  refreshDevices: () => void;
  addDevice: (device: Device) => void;
  removeDevice: (deviceId: string) => void;
  updateDevice: (deviceId: string, updates: Partial<Device>) => void;
  // Sync log actions
  addSyncLog: (log: SyncLog) => void;
  updateSyncLog: (id: string, updates: Partial<SyncLog>) => void;
  clearSyncLogs: () => void;
  // Notification actions
  pushNotification: (n: Omit<AppNotification, "id" | "at" | "read">) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  // Settings actions
  updateSettings: (updates: Partial<VRSettings>) => void;
  resetStore: () => void;
  loadDemoData: () => void;
  /** Vide toutes les données fictives — appelé au passage en Mode Réel */
  setRealModeData: () => void;
}

export const useVRStore = create<VRStore>()(
  persist(
    (set) => ({
      libraries: DEMO_LIBRARIES,
      devices: DEMO_DEVICES,
      syncLogs: DEMO_SYNC_LOGS,
      notifications: [],
      settings: DEFAULT_SETTINGS,

      addPlaylist: (libraryId, name) =>
        set((s) => ({
          libraries: s.libraries.map((lib) =>
            lib.id === libraryId
              ? { ...lib, playlists: [...lib.playlists, { id: `pl-${Date.now()}`, name, videos: [] }] }
              : lib
          ),
        })),

      removePlaylist: (libraryId, playlistId) =>
        set((s) => ({
          libraries: s.libraries.map((lib) =>
            lib.id === libraryId
              ? { ...lib, playlists: lib.playlists.filter((p) => p.id !== playlistId) }
              : lib
          ),
        })),

      renamePlaylist: (libraryId, playlistId, newName) =>
        set((s) => ({
          libraries: s.libraries.map((lib) =>
            lib.id === libraryId
              ? {
                  ...lib,
                  playlists: lib.playlists.map((p) =>
                    p.id === playlistId ? { ...p, name: newName } : p
                  ),
                }
              : lib
          ),
        })),

      addVideo: (libraryId, playlistId, video) =>
        set((s) => ({
          libraries: s.libraries.map((lib) =>
            lib.id === libraryId
              ? {
                  ...lib,
                  playlists: lib.playlists.map((p) =>
                    p.id === playlistId ? { ...p, videos: [...p.videos, video] } : p
                  ),
                }
              : lib
          ),
        })),

      removeVideo: (libraryId, playlistId, videoId) =>
        set((s) => ({
          libraries: s.libraries.map((lib) =>
            lib.id === libraryId
              ? {
                  ...lib,
                  playlists: lib.playlists.map((p) =>
                    p.id === playlistId
                      ? { ...p, videos: p.videos.filter((v) => v.id !== videoId) }
                      : p
                  ),
                }
              : lib
          ),
        })),

      updateVideo: (libraryId, playlistId, videoId, updates) =>
        set((s) => ({
          libraries: s.libraries.map((lib) =>
            lib.id === libraryId
              ? {
                  ...lib,
                  playlists: lib.playlists.map((p) =>
                    p.id === playlistId
                      ? {
                          ...p,
                          videos: p.videos.map((v) =>
                            v.id === videoId ? { ...v, ...updates } : v
                          ),
                        }
                      : p
                  ),
                }
              : lib
          ),
        })),

      refreshDevices: () =>
        set((s) => ({
          devices: s.devices.map((d) => ({
            ...d,
            status: d.status === "disconnected" && Math.random() > 0.7 ? "connected" : d.status,
          })),
        })),

      addDevice: (device) =>
        set((s) => ({ devices: [...s.devices, device] })),

      removeDevice: (deviceId) =>
        set((s) => ({ devices: s.devices.filter((d) => d.id !== deviceId) })),

      updateDevice: (deviceId, updates) =>
        set((s) => ({
          devices: s.devices.map((d) => (d.id === deviceId ? { ...d, ...updates } : d)),
        })),

      addSyncLog: (log) =>
        set((s) => ({ syncLogs: [log, ...s.syncLogs] })),

      updateSyncLog: (id, updates) =>
        set((s) => ({
          syncLogs: s.syncLogs.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),

      clearSyncLogs: () => set({ syncLogs: [] }),

      pushNotification: (n) =>
        set((s) => ({
          notifications: [
            {
              ...n,
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              at: new Date().toISOString(),
              read: false,
            },
            ...s.notifications,
          ].slice(0, 50), // garder max 50
        })),

      markAllNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),

      clearNotifications: () => set({ notifications: [] }),

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      resetStore: () =>
        set({
          libraries: DEMO_LIBRARIES,
          devices: DEMO_DEVICES,
          syncLogs: DEMO_SYNC_LOGS,
          notifications: [],
          settings: DEFAULT_SETTINGS,
        }),

      loadDemoData: () =>
        set({
          libraries: DEMO_LIBRARIES,
          devices: DEMO_DEVICES,
          syncLogs: DEMO_SYNC_LOGS,
        }),

      setRealModeData: () =>
        set({
          libraries: EMPTY_LIBRARIES,
          devices: [],
          syncLogs: [],
        }),
    }),
    { name: "vr-ultimate-store" }
  )
);

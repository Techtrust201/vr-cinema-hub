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
}

const DEFAULT_SETTINGS: VRSettings = {
  videoStoragePath: "/videos/vr-ultimate",
  maxUploadGB: 10,
  authToken: "",
};

const MOCK_DEVICES: Device[] = [
  {
    id: "d1",
    serial: "1WMHHA000X0000",
    name: "Quest 3 — Location #1",
    type: "location",
    status: "connected",
    storageUsedGB: 12.4,
    storageTotalGB: 128,
    battery: 87,
    lastSyncAt: "2025-03-18T14:32:00Z",
    ipAddress: "192.168.1.42",
  },
  {
    id: "d2",
    serial: "1WMHHA001X0001",
    name: "Quest 2 — Location #2",
    type: "location",
    status: "connected",
    storageUsedGB: 8.7,
    storageTotalGB: 256,
    battery: 62,
    lastSyncAt: "2025-03-17T09:15:00Z",
    ipAddress: "192.168.1.43",
  },
  {
    id: "d3",
    serial: "2XNAHB002Y0002",
    name: "Quest 3 — Animations #1",
    type: "animations",
    status: "disconnected",
    storageUsedGB: 22.1,
    storageTotalGB: 128,
    battery: 0,
    lastSyncAt: "2025-03-10T16:44:00Z",
    ipAddress: null,
  },
  {
    id: "d4",
    serial: "2XNAHB003Y0003",
    name: "Quest 3 — Animations #2",
    type: "animations",
    status: "connected",
    storageUsedGB: 5.3,
    storageTotalGB: 128,
    battery: 94,
    lastSyncAt: null,
    ipAddress: "192.168.1.44",
  },
];

const INITIAL_LIBRARIES: Library[] = [
  {
    id: "location",
    name: "Location",
    playlists: [
      {
        id: "pl-loc-1",
        name: "Expériences Immersives",
        videos: [
          { id: "v1", name: "Nature_360_4K.mp4", format: "360", stereo: "sbs", sizeGB: 4.2, duration: "8:32", addedAt: "2025-03-10" },
          { id: "v2", name: "Sous_Marin_180.mp4", format: "180", stereo: "sbs", sizeGB: 2.8, duration: "5:14", addedAt: "2025-03-12" },
          { id: "v3", name: "Espace_360_8K.mp4", format: "360", stereo: "sbs", sizeGB: 6.1, duration: "12:05", addedAt: "2025-03-15" },
        ],
      },
      {
        id: "pl-loc-2",
        name: "Relaxation",
        videos: [
          { id: "v4", name: "Montagne_360.mp4", format: "360", stereo: "mono", sizeGB: 3.5, duration: "6:20", addedAt: "2025-03-11" },
          { id: "v5", name: "Plage_Coucher.mp4", format: "180", stereo: "ou", sizeGB: 1.9, duration: "4:10", addedAt: "2025-03-14" },
        ],
      },
    ],
  },
  {
    id: "animations",
    name: "Animations",
    playlists: [
      {
        id: "pl-anim-1",
        name: "Événement Corporate",
        videos: [
          { id: "v6", name: "Présentation_360.mp4", format: "360", stereo: "sbs", sizeGB: 2.2, duration: "3:45", addedAt: "2025-03-16" },
          { id: "v7", name: "Teaser_180_HD.mp4", format: "180", stereo: "sbs", sizeGB: 1.4, duration: "2:30", addedAt: "2025-03-17" },
        ],
      },
      {
        id: "pl-anim-2",
        name: "Festival",
        videos: [
          { id: "v8", name: "Scene_360_Live.mp4", format: "360", stereo: "mono", sizeGB: 5.8, duration: "15:00", addedAt: "2025-03-18" },
        ],
      },
    ],
  },
];

const INITIAL_LOGS: SyncLog[] = [
  {
    id: "log1",
    at: "2025-03-18T14:32:00Z",
    library: "location",
    deviceIds: ["d1"],
    videosTotal: 5,
    videosPushed: 2,
    videosSkipped: 3,
    status: "success",
    lines: [
      "[14:32:01] Connexion ADB → 1WMHHA000X0000 ✓",
      "[14:32:02] Comparaison des fichiers...",
      "[14:32:03] Push: Nature_360_4K.mp4 (4.2 GB) ✓",
      "[14:32:18] Push: Espace_360_8K.mp4 (6.1 GB) ✓",
      "[14:32:19] Skip: Sous_Marin_180.mp4 (déjà présent)",
      "[14:32:19] Skip: Montagne_360.mp4 (déjà présent)",
      "[14:32:19] Skip: Plage_Coucher.mp4 (déjà présent)",
      "[14:32:20] manifest.json envoyé ✓",
      "[14:32:20] Sync terminée — 2 fichiers envoyés, 3 ignorés.",
    ],
  },
  {
    id: "log2",
    at: "2025-03-17T09:15:00Z",
    library: "location",
    deviceIds: ["d1", "d2"],
    videosTotal: 5,
    videosPushed: 5,
    videosSkipped: 0,
    status: "success",
    lines: ["[09:15:01] Sync complète vers 2 casques — 5 fichiers envoyés."],
  },
  {
    id: "log3",
    at: "2025-03-10T16:44:00Z",
    library: "animations",
    deviceIds: ["d3"],
    videosTotal: 3,
    videosPushed: 0,
    videosSkipped: 0,
    status: "error",
    lines: ["[16:44:02] Erreur ADB : appareil déconnecté en cours de sync."],
  },
];

interface VRStore {
  libraries: Library[];
  devices: Device[];
  syncLogs: SyncLog[];
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
  // Settings actions
  updateSettings: (updates: Partial<VRSettings>) => void;
  resetStore: () => void;
}

export const useVRStore = create<VRStore>()(
  persist(
    (set) => ({
      libraries: INITIAL_LIBRARIES,
      devices: MOCK_DEVICES,
      syncLogs: INITIAL_LOGS,
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

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      resetStore: () =>
        set({
          libraries: INITIAL_LIBRARIES,
          devices: MOCK_DEVICES,
          syncLogs: INITIAL_LOGS,
          settings: DEFAULT_SETTINGS,
        }),
    }),
    { name: "vr-ultimate-store" }
  )
);

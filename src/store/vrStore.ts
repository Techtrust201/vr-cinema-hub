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
}

const DEFAULT_SETTINGS: VRSettings = {
  videoStoragePath: "/videos/vr-ultimate",
  maxUploadGB: 10,
  authToken: "",
  serverUrl: "http://localhost:3001",
};

// Empty initial state — user enters real data
const EMPTY_LIBRARIES: Library[] = [
  { id: "location", name: "Location", playlists: [] },
  { id: "animations", name: "Animations", playlists: [] },
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
      libraries: EMPTY_LIBRARIES,
      devices: [],
      syncLogs: [],
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
          libraries: EMPTY_LIBRARIES,
          devices: [],
          syncLogs: [],
          settings: DEFAULT_SETTINGS,
        }),
    }),
    { name: "vr-ultimate-store" }
  )
);

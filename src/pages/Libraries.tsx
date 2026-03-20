import { useState, useRef } from "react";
import { useVRStore, LibraryType, Video, VideoFormat, StereoMode } from "@/store/vrStore";
import VideoRow from "@/components/dashboard/VideoRow";
import VideoPreviewModal from "@/components/dashboard/VideoPreviewModal";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Plus,
  Trash2,
  Upload,
  MapPin,
  Clapperboard,
  FolderOpen,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

function detectFormat(name: string): VideoFormat {
  const n = name.toLowerCase();
  if (n.includes("180")) return "180";
  return "360";
}

function detectStereo(name: string): StereoMode {
  const n = name.toLowerCase();
  if (n.includes("sbs") || n.includes("side_by_side") || n.includes("3d")) return "sbs";
  if (n.includes("_ou") || n.includes("top_bottom")) return "ou";
  return "mono";
}

interface AddPlaylistModalProps {
  libraryId: LibraryType;
  onClose: () => void;
}

function AddPlaylistModal({ libraryId, onClose }: AddPlaylistModalProps) {
  const [name, setName] = useState("");
  const addPlaylist = useVRStore((s) => s.addPlaylist);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addPlaylist(libraryId, name.trim());
    toast.success(`Playlist "${name.trim()}" créée`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-xl border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-violet)_/_0.2)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">Nouvelle playlist</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la playlist…"
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm transition-colors"
          />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={!name.trim()} className="flex-1 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] disabled:opacity-40 transition-colors">
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PlaylistAccordionProps {
  libraryId: LibraryType;
  playlistId: string;
  name: string;
  videos: Video[];
}

function PlaylistAccordion({ libraryId, playlistId, name, videos }: PlaylistAccordionProps) {
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [previewVideo, setPreviewVideo] = useState<Video | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { addVideo, removeVideo, removePlaylist, updateVideo, renamePlaylist } = useVRStore();

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== name) {
      renamePlaylist(libraryId, playlistId, trimmed);
      toast.success("Playlist renommée");
    } else {
      setNameValue(name);
    }
    setEditingName(false);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const sizeGB = file.size / 1e9;
      const format = detectFormat(file.name);
      const stereo = detectStereo(file.name);
      const video: Video = {
        id: `v-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        format,
        stereo,
        sizeGB: parseFloat(sizeGB.toFixed(2)) || 0.01,
        duration: "—",
        addedAt: new Date().toISOString().slice(0, 10),
      };
      addVideo(libraryId, playlistId, video);
    });
    toast.success(`${files.length} vidéo(s) ajoutée(s)`);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface)_/_0.5)] overflow-hidden">
      {/* Playlist header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(!open)} className="p-0.5 text-muted-foreground shrink-0">
          <ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} />
        </button>
        <FolderOpen size={15} className="text-[hsl(var(--vr-violet))] shrink-0" />

        {editingName ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameValue(name); setEditingName(false); } }}
              className="flex-1 min-w-0 px-2 py-0.5 text-sm font-medium rounded border border-[hsl(var(--vr-violet)_/_0.5)] bg-background focus:outline-none"
            />
            <button onClick={commitName} className="p-1 text-[hsl(140_70%_55%)] hover:bg-muted/50 rounded shrink-0"><Check size={12} /></button>
            <button onClick={() => { setNameValue(name); setEditingName(false); }} className="p-1 text-muted-foreground hover:bg-muted/50 rounded shrink-0"><X size={12} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0 group/pl">
            <span className="text-sm font-medium text-foreground truncate">{name}</span>
            <span className="text-xs text-muted-foreground/60 shrink-0">({videos.length})</span>
            <button
              onClick={() => setEditingName(true)}
              className="opacity-0 group-hover/pl:opacity-100 p-0.5 rounded text-muted-foreground/50 hover:text-[hsl(var(--vr-violet))] transition-all shrink-0"
            >
              <Pencil size={11} />
            </button>
          </div>
        )}

        <button
          onClick={() => {
            removePlaylist(libraryId, playlistId);
            toast.info(`Playlist "${name}" supprimée`);
          }}
          className="p-1.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-2">
          {/* Video list */}
          {previewVideo && (
            <VideoPreviewModal video={previewVideo} onClose={() => setPreviewVideo(null)} />
          )}
          {videos.length > 0 ? (
            <div className="space-y-1.5">
              {videos.map((v) => (
                <VideoRow
                  key={v.id}
                  video={v}
                  onRemove={() => removeVideo(libraryId, playlistId, v.id)}
                  onUpdate={(updates) => {
                    updateVideo(libraryId, playlistId, v.id, updates);
                    toast.success("Format mis à jour");
                  }}
                  onPreview={() => setPreviewVideo(v)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 py-2 text-center">Aucune vidéo — glissez-déposez des fichiers ci-dessous</p>
          )}

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "mt-2 rounded-lg border-2 border-dashed px-4 py-4 flex flex-col items-center gap-2 cursor-pointer transition-all duration-200",
              dragging
                ? "border-[hsl(var(--vr-violet))] bg-[hsl(var(--vr-violet)_/_0.08)] scale-[1.01]"
                : "border-border/50 hover:border-[hsl(var(--vr-violet)_/_0.4)] hover:bg-[hsl(var(--vr-violet)_/_0.04)]"
            )}
          >
            <Upload size={16} className={cn("transition-colors", dragging ? "text-[hsl(var(--vr-violet))]" : "text-muted-foreground/50")} />
            <p className="text-xs text-muted-foreground/70 text-center">
              Glissez-déposez des vidéos ici ou <span className="text-[hsl(var(--vr-violet))]">cliquez pour parcourir</span>
            </p>
            <p className="text-[10px] text-muted-foreground/40">mp4, mov, mkv, webm, avi, m4v</p>
          </div>
          <input ref={fileRef} type="file" multiple accept="video/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}
    </div>
  );
}

interface LibraryPanelProps {
  libraryId: LibraryType;
}

function LibraryPanel({ libraryId }: LibraryPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const library = useVRStore((s) => s.libraries.find((l) => l.id === libraryId));

  if (!library) return null;
  const totalVideos = library.playlists.reduce((acc, p) => acc + p.videos.length, 0);

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{library.playlists.length} playlist(s)</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          <span className="text-sm text-muted-foreground">{totalVideos} vidéo(s)</span>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--vr-violet)_/_0.12)] text-[hsl(var(--vr-violet))] border border-[hsl(var(--vr-violet)_/_0.25)] text-xs font-medium hover:bg-[hsl(var(--vr-violet)_/_0.2)] transition-colors"
        >
          <Plus size={13} /> Ajouter une playlist
        </button>
      </div>

      {/* Playlists */}
      {library.playlists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 py-12 flex flex-col items-center gap-2 text-muted-foreground/50">
          <FolderOpen size={28} />
          <p className="text-sm">Aucune playlist. Créez-en une pour commencer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {library.playlists.map((p) => (
            <PlaylistAccordion
              key={p.id}
              libraryId={libraryId}
              playlistId={p.id}
              name={p.name}
              videos={p.videos}
            />
          ))}
        </div>
      )}

      {modalOpen && <AddPlaylistModal libraryId={libraryId} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

export default function Libraries() {
  const [activeLib, setActiveLib] = useState<LibraryType>("location");

  const tabs: { id: LibraryType; label: string; icon: typeof MapPin }[] = [
    { id: "location", label: "Location", icon: MapPin },
    { id: "animations", label: "Animations", icon: Clapperboard },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bibliothèques</h1>
        <p className="text-sm text-muted-foreground mt-1">Gérez vos playlists et vidéos VR</p>
      </div>

      {/* Library tabs */}
      <div className="flex gap-2 border-b border-border/50 pb-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveLib(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition-all duration-200",
              activeLib === id
                ? id === "location"
                  ? "border-[hsl(var(--vr-violet))] text-[hsl(var(--vr-violet))]"
                  : "border-[hsl(var(--vr-cyan))] text-[hsl(var(--vr-cyan))]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <LibraryPanel key={activeLib} libraryId={activeLib} />
    </div>
  );
}

import { cn } from "@/lib/utils";

interface ApiEndpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  body?: string;
  auth?: boolean;
}

const endpoints: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/libraries",
    description: "Liste des bibliothèques avec playlists et vidéos",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/manifest/location",
    description: "Manifest JSON pour l'app VR — bibliothèque Location",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/manifest/animations",
    description: "Manifest JSON pour l'app VR — bibliothèque Animations",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/devices",
    description: "Liste des appareils ADB connectés (USB ou Wi-Fi)",
  },
  {
    method: "POST",
    path: "/api/sync",
    description: "Lance la synchronisation push vers les casques",
    body: '{ "librarySlug": "location" | "animations", "deviceSerial"?: "..." }',
  },
  {
    method: "POST",
    path: "/api/libraries/[libraryId]/playlists",
    description: "Crée une nouvelle playlist dans la bibliothèque",
    body: '{ "name": "Nom de la playlist" }',
  },
  {
    method: "POST",
    path: "/api/playlists/[playlistId]/videos",
    description: "Upload une vidéo — analyse ffprobe, hash SHA256, enregistrement BDD",
    body: "FormData: file (video), fileName? (string)",
  },
];

export const ApiTable = () => {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[hsl(240_10%_7%)] border-b border-border/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-20">Méthode</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Endpoint</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Body / Notes</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((endpoint, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-border/30 transition-colors duration-150",
                  "hover:bg-[hsl(var(--vr-violet)_/_0.04)]",
                  i % 2 === 0 ? "bg-card" : "bg-[hsl(240_10%_6%)]"
                )}
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono font-bold border",
                      endpoint.method === "GET"
                        ? "bg-[hsl(var(--vr-cyan)_/_0.12)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.3)]"
                        : "bg-[hsl(var(--vr-violet)_/_0.12)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.3)]"
                    )}
                  >
                    {endpoint.method}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="font-mono text-xs text-foreground/80 bg-muted/50 px-2 py-1 rounded whitespace-nowrap">
                    {endpoint.path}
                  </code>
                  {endpoint.auth && (
                    <span className="ml-2 text-xs text-[hsl(40_90%_55%)] opacity-70">🔒</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{endpoint.description}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {endpoint.body ? (
                    <code className="text-xs font-mono text-muted-foreground/70">{endpoint.body}</code>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

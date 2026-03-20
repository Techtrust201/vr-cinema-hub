import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showPrompt?: boolean;
}

export const CodeBlock = ({ code, language = "bash", title, showPrompt = true }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.trim().split("\n");

  return (
    <div className="rounded-lg overflow-hidden border border-border/50 bg-[hsl(240_11%_5%)]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[hsl(240_10%_7%)] border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[hsl(0_70%_55%)]" />
            <span className="w-3 h-3 rounded-full bg-[hsl(40_90%_55%)]" />
            <span className="w-3 h-3 rounded-full bg-[hsl(140_70%_45%)]" />
          </div>
          {title && (
            <div className="flex items-center gap-1.5 ml-2">
              <Terminal size={12} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-mono">{title}</span>
            </div>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-all hover:bg-accent/50 active:scale-95"
        >
          {copied ? (
            <>
              <Check size={12} className="text-[hsl(140_70%_55%)]" />
              <span className="text-[hsl(140_70%_55%)]">Copié</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>

      {/* Code area */}
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-sm leading-6">
          {lines.map((line, i) => {
            const isComment = line.trim().startsWith("#");
            const isBlank = line.trim() === "";
            return (
              <div key={i} className="flex">
                {showPrompt && language === "bash" && !isBlank && !isComment && (
                  <span className="text-[hsl(var(--vr-cyan))] select-none mr-2 shrink-0">$</span>
                )}
                {showPrompt && language === "bash" && isComment && (
                  <span className="text-muted-foreground/60 select-none mr-2 shrink-0">#</span>
                )}
                {showPrompt && language === "bash" && isBlank && (
                  <span className="select-none mr-2 shrink-0">&nbsp;</span>
                )}
                <span
                  className={
                    isComment
                      ? "text-muted-foreground/60"
                      : isBlank
                      ? ""
                      : line.startsWith("DATABASE_URL") || line.startsWith("VIDEO_") || line.startsWith("MAX_") || line.startsWith("DASHBOARD_")
                      ? "text-[hsl(var(--vr-violet))]"
                      : "text-foreground"
                  }
                >
                  {isComment ? line.replace(/^#\s?/, "") : line}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
};

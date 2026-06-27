import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Loader, AlertTriangle, FileText, Image, FileType, ChevronLeft } from "lucide-react";
import { marked } from "marked";

interface Props {
  path: string;
  onClose: () => void;
}

type FileKind = "image" | "pdf" | "markdown" | "text" | "unknown";

const IMAGE_EXTS = new Set(["jpg","jpeg","png","gif","bmp","webp","svg","avif","ico","tiff","tif"]);
const TEXT_EXTS  = new Set(["txt","log","json","yaml","yml","toml","ini","csv","xml","sh","py","js","ts","rs","go","css","html"]);

function getKind(path: string): FileKind {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext))              return "image";
  if (ext === "pdf")                    return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (TEXT_EXTS.has(ext))              return "text";
  return "unknown";
}

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif",  bmp: "image/bmp",  webp: "image/webp",
    svg: "image/svg+xml", avif: "image/avif",
    tiff: "image/tiff", tif: "image/tiff",
  };
  return map[ext] ?? "image/jpeg";
}

function basename(p: string) { return p.split("/").pop() ?? p; }

export function FileViewer({ path, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [b64, setB64]         = useState<string | null>(null);
  const [text, setText]       = useState<string | null>(null);

  const kind = getKind(path);
  const ext  = path.split(".").pop()?.toLowerCase() ?? "";
  const name = basename(path);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setB64(null);
    setText(null);

    if (kind === "image" || kind === "pdf") {
      invoke<string>("read_file_base64", { path })
        .then(setB64).catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else if (kind === "markdown" || kind === "text") {
      invoke<string>("read_text_file", { path })
        .then(setText).catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [path, kind]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const dataUrl = b64
    ? kind === "pdf"
      ? `data:application/pdf;base64,${b64}`
      : `data:${mimeForExt(ext)};base64,${b64}`
    : null;

  return (
    /* overlay oscuro a la izquierda — click cierra */
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Panel lateral derecho */}
      <div className="flex flex-col bg-[#111111] border-l border-[#2e2e2e] shadow-2xl"
        style={{ width: "min(520px, 55vw)" }}>

        {/* Header con botón grande */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#2e2e2e] bg-[#161616] shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-[#9ca3af] hover:text-white hover:bg-[#2e2e2e] transition-colors shrink-0"
          >
            <ChevronLeft size={14} /> Cerrar
          </button>
          <div className="w-px h-4 bg-[#3a3a3a]" />
          {kind === "image"    && <Image    size={13} className="text-[#3b82f6] shrink-0" />}
          {kind === "pdf"      && <FileType size={13} className="text-[#ef4444] shrink-0" />}
          {(kind === "markdown" || kind === "text") && <FileText size={13} className="text-[#10b981] shrink-0" />}
          <span className="text-xs text-[#e5e7eb] truncate flex-1">{name}</span>
          <span className="text-[10px] text-[#4b5563] font-mono uppercase shrink-0">.{ext}</span>
          <button onClick={onClose} className="p-1 rounded text-[#4b5563] hover:text-[#9ca3af] transition-colors shrink-0">
            <X size={13} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-3">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-[#6b7280]">
              <Loader size={22} className="animate-spin" />
              <span className="text-xs">Cargando…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 text-[#ef4444] px-4 text-center">
              <AlertTriangle size={22} />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {!loading && !error && kind === "image" && dataUrl && (
            <img src={dataUrl} alt={name}
              className="max-w-full max-h-full object-contain rounded" />
          )}

          {!loading && !error && kind === "pdf" && dataUrl && (
            <iframe src={dataUrl} title={name}
              className="w-full h-full rounded border-0" />
          )}

          {!loading && !error && kind === "markdown" && text !== null && (
            <div className="w-full h-full overflow-auto px-5 py-4">
              <div
                className="prose prose-invert prose-sm max-w-none"
                style={{ color: "#e5e7eb" }}
                dangerouslySetInnerHTML={{ __html: marked.parse(text) as string }}
              />
            </div>
          )}

          {!loading && !error && kind === "text" && text !== null && (
            <pre className="w-full h-full overflow-auto text-[11px] text-[#9ca3af] font-mono p-3 leading-relaxed whitespace-pre-wrap break-words">
              {text}
            </pre>
          )}

          {!loading && !error && kind === "unknown" && (
            <div className="flex flex-col items-center gap-2 text-[#6b7280] text-center px-4">
              <FileText size={28} className="opacity-20" />
              <span className="text-xs">Sin visor para .{ext}</span>
              <span className="text-[11px] text-[#4b5563]">Soportados: imágenes · PDF · Markdown · texto</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tag, File, FolderOpen, Search, ArrowUp, Monitor, Wifi, Eye, Plus, X } from "lucide-react";
import type { TagEntry, FileEntry, SshProfile } from "../lib/types";
import { tagColor, formatBytes } from "../lib/utils";
import { TagChip } from "../components/TagChip";
import { FileViewer } from "../components/FileViewer";
import { TagInlineEditor } from "../components/TagInlineEditor";

type View = "all" | string;
type Mode = "local" | "ssh";

export function TagsPage() {
  const [path, setPath]         = useState("");
  const [mode, setMode]         = useState<Mode>("local");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<SshProfile[]>([]);

  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [tags, setTags]         = useState<TagEntry[]>([]);
  const [view, setView]         = useState<View>("all");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned]   = useState(false);
  const [search, setSearch]     = useState("");

  const [addingTo, setAddingTo]   = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_home_dir").then(setPath);
    invoke<SshProfile[]>("list_ssh_profiles").then(setProfiles).catch(() => {});
  }, []);


  async function scan(targetPath?: string) {
    const target = targetPath ?? path;
    if (!target) return;
    if (targetPath) setPath(targetPath);
    setScanning(true);
    setView("all");
    setSearch("");
    setAddingTo(null);
    try {
      let files: FileEntry[];
      if (mode === "ssh" && profileId) {
        files = await invoke<FileEntry[]>("list_dir_ssh", { profileId, path: target });
      } else {
        files = await invoke<FileEntry[]>("list_dir", { path: target });
      }
      setAllFiles(files);
      const counts: Record<string, number> = {};
      for (const f of files) {
        for (const t of f.tags) counts[t] = (counts[t] ?? 0) + 1;
      }
      setTags(Object.entries(counts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)));
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }

  function goUp() {
    const parent = path.replace(/\/$/, "").split("/").slice(0, -1).join("/") || "/";
    scan(parent);
  }

  async function addTag(file: FileEntry, tag: string) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || file.tags.includes(t)) return;
    const newTags = [...file.tags, t];
    await invoke("set_file_tags", { path: file.path, tags: newTags });
    updateFileTags(file.path, newTags);
  }

  async function removeTag(file: FileEntry, tag: string) {
    const newTags = file.tags.filter((x) => x !== tag);
    await invoke("set_file_tags", { path: file.path, tags: newTags });
    updateFileTags(file.path, newTags);
  }

  function updateFileTags(filePath: string, newTags: string[]) {
    setAllFiles((prev) => {
      const next = prev.map((f) => f.path === filePath ? { ...f, tags: newTags } : f);
      const counts: Record<string, number> = {};
      for (const f of next) {
        for (const t of f.tags) counts[t] = (counts[t] ?? 0) + 1;
      }
      setTags(Object.entries(counts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)));
      return next;
    });
  }

  async function deleteTagFromAll(tag: string) {
    for (const file of allFiles.filter((f) => f.tags.includes(tag))) {
      const newTags = file.tags.filter((t) => t !== tag);
      await invoke("set_file_tags", { path: file.path, tags: newTags });
    }
    setAllFiles((prev) => prev.map((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) })));
    setTags((prev) => prev.filter((t) => t.tag !== tag));
    if (view === tag) setView("all");
  }

  const visibleFiles = allFiles.filter((f) => {
    const matchesView = view === "all" || f.tags.includes(view);
    const matchesSearch = !search || f.name.toLowerCase().includes(search.toLowerCase());
    return matchesView && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar — same style as FileBrowser */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] border-b border-[#2e2e2e]">
        <Tag size={14} className="text-[#3b82f6] shrink-0" />
        {/* Local / SSH toggle */}
        <div className="flex rounded overflow-hidden border border-[#3a3a3a] shrink-0">
          <button onClick={() => setMode("local")}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              mode === "local" ? "bg-[#3a3a3a] text-white" : "text-[#6b7280] hover:text-[#9ca3af]"
            }`}>
            <Monitor size={10} /> Local
          </button>
          <button onClick={() => setMode("ssh")}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              mode === "ssh" ? "bg-[#3a3a3a] text-white" : "text-[#6b7280] hover:text-[#9ca3af]"
            }`}>
            <Wifi size={10} /> SSH
          </button>
        </div>
        {mode === "ssh" && (
          <select value={profileId ?? ""}
            onChange={(e) => setProfileId(e.target.value || null)}
            className="bg-[#262626] border border-[#3a3a3a] text-[#e5e7eb] text-[11px] px-2 py-0.5 rounded outline-none focus:border-[#3b82f6] shrink-0">
            <option value="">— elegir host —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.host})</option>)}
          </select>
        )}
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && scan()}
          className="flex-1 min-w-0 bg-[#262626] text-[#e5e7eb] text-xs px-2 py-1 rounded border border-[#3a3a3a] outline-none focus:border-[#3b82f6] font-mono"
        />
        <button onClick={goUp} disabled={scanning}
          className="p-1 rounded hover:bg-[#2e2e2e] text-[#9ca3af] hover:text-white disabled:opacity-30 shrink-0">
          <ArrowUp size={14} />
        </button>
        <button onClick={() => scan()} disabled={scanning || !path}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 transition-colors shrink-0">
          {scanning ? "Cargando..." : scanned ? "Recargar" : "Cargar"}
        </button>
      </div>

      {!scanned ? (
        <div className="flex flex-col items-center gap-2 py-16 text-[#6b7280]">
          <Tag size={32} className="opacity-20" />
          <p className="text-xs">Cargá una carpeta para ver y editar los tags de sus archivos</p>
          <p className="text-[11px] text-[#4b5563]">Los tags se guardan invisibles en el archivo, compatibles con rsync</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: tag list */}
          <div className="w-52 shrink-0 border-r border-[#2e2e2e] overflow-y-auto bg-[#161616] flex flex-col">
            <button onClick={() => setView("all")}
              className={`flex items-center justify-between px-3 py-2.5 text-xs border-b border-[#2e2e2e] transition-colors ${
                view === "all" ? "bg-[#1e1e1e] text-white font-medium" : "text-[#9ca3af] hover:bg-[#1e1e1e] hover:text-[#e5e7eb]"
              }`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                Todos los archivos
              </div>
              <span className="text-[10px] text-[#4b5563]">{allFiles.length}</span>
            </button>

            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
              {tags.length === 0 && (
                <p className="text-[11px] text-[#4b5563] px-2 py-3 text-center leading-relaxed">
                  Ningún archivo tiene tags aún. Pasá el cursor sobre un archivo y usá el botón&nbsp;
                  <span className="text-[#3b82f6]">+ tag</span>.
                </p>
              )}
              {tags.map((t) => {
                const color = tagColor(t.tag);
                const active = view === t.tag;
                return (
                  <div key={t.tag}
                    className={`group flex items-center rounded transition-colors ${active ? "bg-[#1e1e1e]" : "hover:bg-[#1e1e1e]"}`}
                    style={active ? { borderLeft: `3px solid ${color}`, paddingLeft: "1px" } : {}}>
                    <button onClick={() => setView(t.tag)}
                      className="flex-1 flex items-center justify-between px-3 py-2 text-xs text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="truncate" style={{ color: active ? "#fff" : "#9ca3af" }}>{t.tag}</span>
                      </div>
                      <span className="text-[10px] ml-1 shrink-0" style={{ color: active ? color : "#4b5563" }}>
                        {t.count}
                      </span>
                    </button>
                    <button onClick={() => deleteTagFromAll(t.tag)}
                      title={`Quitar "${t.tag}" de todos los archivos`}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[#6b7280] hover:text-[#ef4444] transition-all shrink-0">
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: file list */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2e2e2e] bg-[#141414]">
              <Search size={12} className="text-[#6b7280] shrink-0" />
              <input
                placeholder="Filtrar archivos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-[#e5e7eb] outline-none placeholder:text-[#4b5563]"
              />
              <span className="text-[10px] text-[#4b5563]">
                {visibleFiles.length} archivo{visibleFiles.length !== 1 ? "s" : ""}
                {view !== "all" && (
                  <span className="ml-1 text-[#6b7280]">
                    con tag "<span style={{ color: tagColor(view) }}>{view}</span>"
                  </span>
                )}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {mode === "ssh" && !profileId ? (
                <div className="flex flex-col items-center gap-2 py-12 text-[#6b7280]">
                  <Wifi size={24} className="opacity-20" />
                  <span className="text-xs">Elegí un perfil SSH arriba</span>
                </div>
              ) : visibleFiles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-[#6b7280]">
                  <Tag size={24} className="opacity-20" />
                  <span className="text-xs">
                    {view !== "all" ? `Ningún archivo tiene el tag "${view}"` : "Carpeta vacía"}
                  </span>
                </div>
              ) : (
                visibleFiles.map((file) => {
                  const isAdding = addingTo === file.path;
                  return (
                    <div key={file.path}
                      onDoubleClick={() => file.is_dir && scan(file.path)}
                      className={`flex items-center gap-3 px-3 py-2 border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors group ${file.is_dir ? "cursor-pointer" : ""}`}>
                      {file.is_dir
                        ? <FolderOpen size={14} className="text-[#f59e0b] shrink-0" />
                        : <File size={14} className="text-[#6b7280] shrink-0" />}

                      <div className="w-48 shrink-0 min-w-0">
                        <button
                          onClick={() => !file.is_dir && setViewingFile(file.path)}
                          className={`text-xs text-[#e5e7eb] truncate font-medium text-left w-full ${!file.is_dir ? "hover:text-[#3b82f6] transition-colors cursor-pointer" : ""}`}
                          title={!file.is_dir ? "Click para previsualizar" : undefined}
                        >
                          {file.name}
                        </button>
                        {!file.is_dir && (
                          <div className="text-[10px] text-[#4b5563]">{formatBytes(file.size)}</div>
                        )}
                      </div>

                      <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
                        {file.tags.map((t) => (
                          <TagChip key={t} tag={t} onRemove={mode === "local" ? () => removeTag(file, t) : undefined} />
                        ))}

                        {mode === "local" && (
                          isAdding ? (
                            <TagInlineEditor
                              existingTags={tags}
                              currentTags={file.tags}
                              onAdd={(tag) => addTag(file, tag)}
                              onClose={() => setAddingTo(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingTo(file.path)}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-[#3a3a3a] text-[#6b7280] hover:border-[#3b82f6] hover:text-[#3b82f6] transition-all text-[10px]">
                              <Plus size={9} /> tag
                            </button>
                          )
                        )}
                      </div>

                      {!file.is_dir && (
                        <button
                          onClick={() => setViewingFile(file.path)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#6b7280] hover:text-[#3b82f6] transition-all shrink-0"
                          title="Previsualizar">
                          <Eye size={13} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {viewingFile && (
        <FileViewer path={viewingFile} onClose={() => setViewingFile(null)} />
      )}
    </div>
  );
}

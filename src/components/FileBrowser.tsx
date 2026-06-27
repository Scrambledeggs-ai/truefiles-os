import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Folder, File, HardDrive, ArrowUp, Wifi, Monitor, Tag, Eye } from "lucide-react";
import type { FileEntry, DiskInfo, SshProfile, PaneState } from "../lib/types";
import { formatBytes, formatDate } from "../lib/utils";
import { TagChip } from "./TagChip";
import { FileViewer } from "./FileViewer";
import { TagInlineEditor } from "./TagInlineEditor";

interface Props {
  label: string;
  pane: PaneState;
  profiles: SshProfile[];
  onPaneChange: (p: Partial<PaneState>) => void;
}

export function FileBrowser({ label, pane, profiles, onPaneChange }: Props) {
  const [entries, setEntries]   = useState<FileEntry[]>([]);
  const [disk, setDisk]         = useState<DiskInfo | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [existingTags, setExistingTags] = useState<{ tag: string }[]>([]);
  const [savingTag, setSavingTag] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  const isSSH = pane.mode === "ssh" && pane.profileId !== null;

  useEffect(() => {
    if (pane.mode === "local") {
      invoke<{ tag: string }[]>("list_all_tags").then(setExistingTags).catch(() => null);
    }
  }, [pane.mode]);

  useEffect(() => {
    setError(null);
    setSelected(null);
    setEntries([]);
    setDisk(null);

    if (isSSH) {
      invoke<FileEntry[]>("list_dir_ssh", { profileId: pane.profileId, path: pane.path })
        .then(setEntries).catch((e) => setError(String(e)));
      invoke<DiskInfo>("get_disk_info_ssh", { profileId: pane.profileId, path: pane.path })
        .then(setDisk).catch(() => null);
    } else if (pane.mode === "local") {
      invoke<FileEntry[]>("list_dir", { path: pane.path })
        .then(setEntries).catch((e) => setError(String(e)));
      invoke<DiskInfo>("get_disk_info", { path: pane.path })
        .then(setDisk).catch(() => null);
    }
  }, [pane.path, pane.mode, pane.profileId]);

  function navigate(entry: FileEntry) {
    if (entry.is_dir) onPaneChange({ path: entry.path });
  }

  function goUp() {
    const parent = pane.path.split("/").slice(0, -1).join("/") || "/";
    onPaneChange({ path: parent });
  }

  async function addTag(tag: string) {
    if (!tag || !selected || selected.tags.includes(tag)) return;
    setSavingTag(true);
    const newTags = [...selected.tags, tag];
    try {
      await invoke("set_file_tags", { path: selected.path, tags: newTags });
      const updated = { ...selected, tags: newTags };
      setSelected(updated);
      setEntries((prev) => prev.map((e) => e.path === selected.path ? updated : e));
      setExistingTags((prev) => prev.find((t) => t.tag === tag) ? prev : [...prev, { tag }]);
    } finally {
      setSavingTag(false);
    }
  }

  async function removeTag(tag: string) {
    if (!selected) return;
    const newTags = selected.tags.filter((t) => t !== tag);
    await invoke("set_file_tags", { path: selected.path, tags: newTags });
    const updated = { ...selected, tags: newTags };
    setSelected(updated);
    setEntries((prev) => prev.map((e) => e.path === selected.path ? updated : e));
  }

  const usedPct = disk ? Math.round((disk.used / disk.total) * 100) : 0;
  const accentColor = label === "ORIGEN" ? "#1d4ed8" : "#065f46";
  const canTag = pane.mode === "local" && selected && !selected.is_dir;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] border-b border-[#2e2e2e]">
        <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
          style={{ background: accentColor, color: "#fff" }}>
          {label}
        </span>
        <div className="flex rounded overflow-hidden border border-[#3a3a3a] shrink-0">
          <button onClick={() => onPaneChange({ mode: "local" })}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              pane.mode === "local" ? "bg-[#3a3a3a] text-white" : "text-[#6b7280] hover:text-[#9ca3af]"
            }`}>
            <Monitor size={10} /> Local
          </button>
          <button onClick={() => onPaneChange({ mode: "ssh" })}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              pane.mode === "ssh" ? "bg-[#3a3a3a] text-white" : "text-[#6b7280] hover:text-[#9ca3af]"
            }`}>
            <Wifi size={10} /> SSH
          </button>
        </div>
        {pane.mode === "ssh" && (
          <select value={pane.profileId ?? ""}
            onChange={(e) => onPaneChange({ profileId: e.target.value || null })}
            className="bg-[#262626] border border-[#3a3a3a] text-[#e5e7eb] text-[11px] px-2 py-0.5 rounded outline-none focus:border-[#3b82f6] shrink-0">
            <option value="">— elegir host —</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.host})</option>)}
          </select>
        )}
        <input
          className="flex-1 min-w-0 bg-[#262626] text-[#e5e7eb] text-xs px-2 py-1 rounded border border-[#3a3a3a] outline-none focus:border-[#3b82f6] font-mono"
          value={pane.path}
          onChange={(e) => onPaneChange({ path: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onPaneChange({ path: (e.target as HTMLInputElement).value }); }}
        />
        <button onClick={goUp}
          className="p-1 rounded hover:bg-[#2e2e2e] text-[#9ca3af] hover:text-white shrink-0">
          <ArrowUp size={14} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {pane.mode === "ssh" && !pane.profileId && (
          <div className="flex flex-col items-center gap-2 py-10 text-[#6b7280]">
            <Wifi size={28} className="opacity-30" />
            <span className="text-xs">Elegí un perfil SSH arriba</span>
          </div>
        )}
        {error && <div className="p-3 text-[#ef4444] text-xs">{error}</div>}
        {!error && (pane.mode === "local" || pane.profileId) && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#1a1a1a] border-b border-[#2e2e2e]">
              <tr className="text-[#6b7280]">
                <th className="text-left px-3 py-1.5 font-medium">Nombre</th>
                <th className="text-right px-3 py-1.5 font-medium">Tamaño</th>
                <th className="text-right px-3 py-1.5 font-medium">Modificado</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.path}
                  onClick={() => setSelected(e.path === selected?.path ? null : e)}
                  onDoubleClick={() => navigate(e)}
                  className={`group cursor-pointer border-b border-[#222] transition-colors ${
                    selected?.path === e.path ? "bg-[#1d3a6b]" : "hover:bg-[#262626]"
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.is_dir
                        ? <Folder size={13} className="text-[#f59e0b] shrink-0" />
                        : <File   size={13} className="text-[#6b7280] shrink-0" />}
                      <span className="truncate text-[#e5e7eb]">{e.name}</span>
                      {e.tags.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {e.tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} />)}
                          {e.tags.length > 3 && (
                            <span className="text-[10px] text-[#6b7280]">+{e.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                      {!e.is_dir && pane.mode === "local" && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); setViewingFile(e.path); }}
                          className="opacity-0 group-hover:opacity-100 ml-auto p-0.5 rounded text-[#6b7280] hover:text-[#3b82f6] transition-all shrink-0"
                          title="Previsualizar">
                          <Eye size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-[#9ca3af] whitespace-nowrap">
                    {e.is_dir ? "—" : formatBytes(e.size)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[#9ca3af] whitespace-nowrap">
                    {formatDate(e.modified)}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !error && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-[#6b7280]">Carpeta vacía</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Tag editor — appears when a local file is selected */}
      {canTag && (
        <div className="px-3 py-2 border-t border-[#2e2e2e] bg-[#141414]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tag size={11} className="text-[#6b7280]" />
            <span className="text-[11px] text-[#6b7280] truncate max-w-[160px]">{selected!.name}</span>
            <button
              onClick={() => setViewingFile(selected!.path)}
              className="ml-auto p-0.5 rounded text-[#6b7280] hover:text-[#3b82f6] transition-colors"
              title="Previsualizar">
              <Eye size={11} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {selected!.tags.length === 0 && (
              <span className="text-[10px] text-[#4b5563] italic">Sin tags</span>
            )}
            {selected!.tags.map((t) => (
              <TagChip key={t} tag={t} onRemove={() => removeTag(t)} />
            ))}
          </div>
          <div className="flex gap-1.5 items-center">
            {addingTag ? (
              <TagInlineEditor
                existingTags={existingTags}
                currentTags={selected!.tags}
                onAdd={addTag}
                onClose={() => setAddingTag(false)}
              />
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                disabled={savingTag}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#262626] border border-[#3a3a3a] text-[#9ca3af] hover:text-white disabled:opacity-40 transition-colors">
                <Tag size={10} /> Agregar tag
              </button>
            )}
          </div>
        </div>
      )}

      {viewingFile && (
        <FileViewer path={viewingFile} onClose={() => setViewingFile(null)} />
      )}

      {/* Disk footer */}
      {disk && (
        <div className="px-3 py-2 border-t border-[#2e2e2e] bg-[#161616]">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive size={11} className="text-[#6b7280]" />
            <span className="text-[#9ca3af] text-[11px]">
              {formatBytes(disk.available)} libre de {formatBytes(disk.total)}
            </span>
          </div>
          <div className="w-full h-1 bg-[#2e2e2e] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${usedPct}%`,
              background: usedPct > 85 ? "#ef4444" : usedPct > 65 ? "#f59e0b" : "#3b82f6",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

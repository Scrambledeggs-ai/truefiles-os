import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Copy, Search, Loader, Trash2, CheckCircle,
  AlertTriangle, HardDrive, ChevronDown, ChevronRight, Eye,
} from "lucide-react";
import type { DuplicateGroup, DupEvent } from "../lib/types";
import { formatBytes } from "../lib/utils";
import { FileViewer } from "../components/FileViewer";

type KeepMap = Record<string, Set<string>>; // hash → set of paths to KEEP

function totalWaste(groups: DuplicateGroup[]): number {
  return groups.reduce((acc, g) => acc + g.size * (g.files.length - 1), 0);
}

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

function dirname(path: string) {
  return path.split("/").slice(0, -1).join("/") || "/";
}

const MIN_SIZE_OPTIONS = [
  { label: "1 B",   value: 1 },
  { label: "1 KB",  value: 1024 },
  { label: "100 KB", value: 102400 },
  { label: "1 MB",  value: 1048576 },
  { label: "10 MB", value: 10485760 },
  { label: "100 MB", value: 104857600 },
];

export function DuplicatesPage() {
  const [root, setRoot]             = useState("");
  const [minSize, setMinSize]       = useState(1024); // 1 KB default
  const [phase, setPhase]           = useState<DupEvent["phase"] | "idle">("idle");
  const [progress, setProgress]     = useState({ current: 0, total: 0 });
  const [message, setMessage]       = useState("");
  const [groups, setGroups]         = useState<DuplicateGroup[]>([]);
  const [keepMap, setKeepMap]       = useState<KeepMap>({});
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [trashing, setTrashing]     = useState<string | null>(null);
  const [confirm, setConfirm]       = useState<string | null>(null); // hash of group to confirm
  const [done, setDone]             = useState(false);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_home_dir").then(setRoot);
  }, []);

  useEffect(() => {
    const unsub = listen<DupEvent>("dup-event", (e) => {
      const ev = e.payload;
      setPhase(ev.phase);
      setMessage(ev.message);
      setProgress({ current: ev.current, total: ev.total });
      if (ev.phase === "done") {
        setGroups(ev.groups);
        setDone(true);
        // Default keepMap: keep first file in each group
        const km: KeepMap = {};
        for (const g of ev.groups) {
          km[g.hash] = new Set([g.files[0]]);
          // auto-expand first 5 groups
        }
        setKeepMap(km);
        setExpanded(new Set(ev.groups.map((g) => g.hash))); // expand all by default
      }
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

  async function startScan() {
    setGroups([]);
    setDone(false);
    setPhase("scanning");
    setMessage("");
    setConfirm(null);
    await invoke("find_duplicates", { root, minSize });
  }

  function toggleKeep(hash: string, path: string) {
    setKeepMap((prev) => {
      const set = new Set(prev[hash] ?? []);
      if (set.has(path)) {
        if (set.size <= 1) return prev; // must keep at least one
        set.delete(path);
      } else {
        set.add(path);
      }
      return { ...prev, [hash]: set };
    });
  }

  function toggleExpand(hash: string) {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(hash) ? s.delete(hash) : s.add(hash);
      return s;
    });
  }

  async function trashGroup(group: DuplicateGroup) {
    const keep = keepMap[group.hash] ?? new Set([group.files[0]]);
    const toDelete = group.files.filter((f) => !keep.has(f));
    setTrash(group.hash, true);
    for (const path of toDelete) {
      try { await invoke("trash_file", { path }); } catch (_) { /* ignore */ }
    }
    // Remove group from list
    setGroups((prev) => prev.filter((g) => g.hash !== group.hash));
    setConfirm(null);
    setTrash(group.hash, false);
  }

  const trashingRef = useRef<Record<string, boolean>>({});
  function setTrash(hash: string, val: boolean) {
    trashingRef.current[hash] = val;
    setTrashing(val ? hash : null);
  }

  const scanning = phase === "scanning" || phase === "hashing";
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const waste = totalWaste(groups);
  const toDeleteCount = groups.reduce((acc, g) => {
    const keep = keepMap[g.hash] ?? new Set([g.files[0]]);
    return acc + g.files.filter((f) => !keep.has(f)).length;
  }, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-[#2e2e2e] bg-[#161616]">
        <Copy size={15} className="text-[#3b82f6] shrink-0" />
        <span className="text-sm font-semibold text-[#e5e7eb] shrink-0">Duplicados</span>
        <input
          placeholder="Directorio..."
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startScan()}
          className="flex-1 bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-1.5 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]"
        />
        <select
          value={minSize}
          onChange={(e) => setMinSize(Number(e.target.value))}
          className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-2 py-1.5 text-xs text-[#9ca3af] outline-none focus:border-[#3b82f6] shrink-0"
        >
          {MIN_SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>min {o.label}</option>
          ))}
        </select>
        <button
          onClick={startScan}
          disabled={scanning || !root}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 transition-colors shrink-0"
        >
          {scanning ? <Loader size={12} className="animate-spin" /> : <Search size={12} />}
          {scanning ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {/* Progress */}
      {scanning && (
        <div className="px-4 py-3 border-b border-[#2e2e2e] bg-[#0d0d0d]">
          <div className="flex items-center justify-between text-xs text-[#9ca3af] mb-1.5">
            <span>{phase === "scanning" ? "Escaneando archivos..." : `Comparando grupo ${progress.current} de ${progress.total}...`}</span>
            {phase === "hashing" && <span>{pct}%</span>}
          </div>
          {phase === "hashing" && (
            <div className="w-full h-1 bg-[#2e2e2e] rounded-full overflow-hidden">
              <div className="h-full bg-[#3b82f6] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          {message && <p className="text-[11px] text-[#6b7280] mt-1 font-mono truncate">{message}</p>}
        </div>
      )}

      {/* Summary */}
      {done && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[#2e2e2e] bg-[#161616]">
          {groups.length === 0 ? (
            <div className="flex items-center gap-2 text-[#10b981] text-xs">
              <CheckCircle size={14} /> Sin duplicados — todos los archivos son únicos
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-[#e5e7eb]">
                <Copy size={13} className="text-[#f59e0b]" />
                <span><strong>{groups.length}</strong> grupos · <strong>{groups.reduce((a, g) => a + g.files.length, 0)}</strong> archivos duplicados</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
                <HardDrive size={13} className="text-[#ef4444]" />
                <span><strong className="text-[#ef4444]">{formatBytes(waste)}</strong> recuperables</span>
              </div>
              <button
                onClick={() => {
                  const allExpanded = groups.every((g) => expanded.has(g.hash));
                  setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.hash)));
                }}
                className="ml-auto text-[11px] text-[#6b7280] hover:text-[#e5e7eb] transition-colors shrink-0">
                {groups.every((g) => expanded.has(g.hash)) ? "Colapsar todos" : "Expandir todos"}
              </button>
              {toDeleteCount > 0 && (
                <span className="text-[11px] text-[#6b7280]">
                  {toDeleteCount} marcado{toDeleteCount > 1 ? "s" : ""} para papelera
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Groups */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-2 py-16 text-[#6b7280]">
            <Copy size={32} className="opacity-20" />
            <p className="text-xs">Elegí un directorio y buscá duplicados</p>
            <p className="text-[11px] text-[#4b5563]">Omite archivos ocultos y symlinks automáticamente</p>
          </div>
        )}

        {groups.map((group) => {
          const keep = keepMap[group.hash] ?? new Set([group.files[0]]);
          const toDelete = group.files.filter((f) => !keep.has(f));
          const isExpanded = expanded.has(group.hash);
          const isConfirming = confirm === group.hash;
          const isTrashing = trashing === group.hash;

          return (
            <div key={group.hash} className="border border-[#2e2e2e] rounded-lg overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleExpand(group.hash)}
                className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#161616] hover:bg-[#1a1a1a] transition-colors text-left"
              >
                {isExpanded ? <ChevronDown size={13} className="text-[#6b7280] shrink-0" /> : <ChevronRight size={13} className="text-[#6b7280] shrink-0" />}
                <span className="text-xs font-medium text-[#e5e7eb]">
                  {group.files.length} copias · {formatBytes(group.size)} cada una
                </span>
                <span className="text-[11px] text-[#ef4444] ml-1">
                  → {formatBytes(group.size * (group.files.length - 1))} recuperables
                </span>
                <span className="ml-auto text-[10px] text-[#4b5563] font-mono">{group.hash.slice(0, 8)}</span>
              </button>

              {/* File list */}
              {isExpanded && (
                <div className="border-t border-[#2e2e2e]">
                  {group.files.map((f) => {
                    const keeping = keep.has(f);
                    return (
                      <div key={f}
                        className={`flex items-center gap-3 px-4 py-2 border-b border-[#1a1a1a] last:border-0 transition-colors ${
                          keeping ? "bg-[#0d1f0d]" : "bg-[#1a1010] hover:bg-[#1e1212]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={keeping}
                          onChange={() => toggleKeep(group.hash, f)}
                          className="accent-[#10b981] w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate"
                            style={{ color: keeping ? "#10b981" : "#9ca3af" }}>
                            {basename(f)}
                          </div>
                          <div className="text-[10px] text-[#4b5563] font-mono truncate">{dirname(f)}</div>
                        </div>
                        <button
                          onClick={() => setViewingFile(f)}
                          className="p-1 text-[#6b7280] hover:text-[#3b82f6] transition-colors shrink-0"
                          title="Previsualizar">
                          <Eye size={13} />
                        </button>
                        <span className="text-[10px] shrink-0"
                          style={{ color: keeping ? "#10b981" : "#6b7280" }}>
                          {keeping ? "conservar" : "papelera"}
                        </span>
                      </div>
                    );
                  })}

                  {/* Group action */}
                  {toDelete.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#0d0d0d] border-t border-[#2e2e2e]">
                      <AlertTriangle size={12} className="text-[#f59e0b] shrink-0" />
                      <span className="text-[11px] text-[#9ca3af] flex-1">
                        {toDelete.length} archivo{toDelete.length > 1 ? "s" : ""} irán a la papelera
                      </span>
                      {isConfirming ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => trashGroup(group)}
                            disabled={isTrashing}
                            className="flex items-center gap-1 px-3 py-1 rounded text-[11px] bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50 transition-colors"
                          >
                            {isTrashing ? <Loader size={10} className="animate-spin" /> : <Trash2 size={10} />}
                            Confirmar
                          </button>
                          <button onClick={() => setConfirm(null)}
                            className="px-3 py-1 rounded text-[11px] border border-[#3a3a3a] text-[#9ca3af] hover:text-white transition-colors">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirm(group.hash)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] border border-[#ef4444] text-[#ef4444] hover:bg-[#ef444415] transition-colors"
                        >
                          <Trash2 size={10} /> Enviar a papelera
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewingFile && (
        <FileViewer path={viewingFile} onClose={() => setViewingFile(null)} />
      )}
    </div>
  );
}

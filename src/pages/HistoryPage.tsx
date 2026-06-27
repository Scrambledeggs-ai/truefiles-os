import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock, CheckCircle, XCircle, Trash2, RefreshCw } from "lucide-react";
import type { HistoryEntry } from "../lib/types";

const MODE_COLORS: Record<string, string> = {
  mirror:      "#ef4444",
  sync:        "#3b82f6",
  incremental: "#10b981",
  "dry-run":   "#f59e0b",
};

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await invoke<HistoryEntry[]>("list_history");
      setEntries(result);
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    await invoke("clear_history");
    setEntries([]);
    setConfirming(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[#6b7280]" />
          <div>
            <h2 className="text-sm font-semibold text-[#e5e7eb]">Historial</h2>
            <p className="text-xs text-[#6b7280]">{entries.length} sync{entries.length !== 1 ? "s" : ""} registrados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs border border-[#3a3a3a] text-[#9ca3af] hover:text-white hover:border-[#4a4a4a] disabled:opacity-50 transition-colors">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
          {entries.length > 0 && (
            confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#f59e0b]">¿Borrar todo?</span>
                <button onClick={clearAll}
                  className="px-2 py-1 rounded text-[11px] bg-[#ef4444] text-white hover:bg-[#dc2626] transition-colors">
                  Sí
                </button>
                <button onClick={() => setConfirming(false)}
                  className="px-2 py-1 rounded text-[11px] border border-[#3a3a3a] text-[#9ca3af] hover:text-white transition-colors">
                  No
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs border border-[#3a3a3a] text-[#6b7280] hover:text-[#ef4444] hover:border-[#ef4444] transition-colors">
                <Trash2 size={11} /> Limpiar
              </button>
            )
          )}
        </div>
      </div>

      {entries.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 py-16 text-[#6b7280]">
          <Clock size={32} className="opacity-20" />
          <p className="text-xs">Sin historial todavía</p>
          <p className="text-[11px] text-[#4b5563]">Cada Sync Now quedará registrado acá</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {entries.map((e) => (
          <div key={e.id}
            className="flex items-center gap-3 px-4 py-3 bg-[#161616] rounded-lg border border-[#2e2e2e]">
            {e.success
              ? <CheckCircle size={15} className="text-[#10b981] shrink-0" />
              : <XCircle    size={15} className="text-[#ef4444] shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-[#e5e7eb] truncate">
                  {e.src} → {e.dst}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                  style={{ background: (MODE_COLORS[e.mode] ?? "#6b7280") + "25", color: MODE_COLORS[e.mode] ?? "#9ca3af" }}>
                  {e.mode}
                </span>
              </div>
              <div className="text-[11px] text-[#6b7280]">
                {formatTs(e.timestamp)}
                <span className="mx-1.5 text-[#3a3a3a]">·</span>
                {formatDuration(e.duration_secs)}
                <span className="mx-1.5 text-[#3a3a3a]">·</span>
                <span className={e.success ? "text-[#10b981]" : "text-[#ef4444]"}>
                  {e.success ? "exitoso" : "falló"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

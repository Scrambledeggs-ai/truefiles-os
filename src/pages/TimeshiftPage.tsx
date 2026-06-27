import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ShieldCheck, Plus, Trash2, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, Loader, Clock,
} from "lucide-react";
import type { TimeshiftSnapshot, TimeshiftEvent } from "../lib/types";

const TAG_COLORS: Record<string, string> = {
  Manual:   "#3b82f6",
  Diario:   "#10b981",
  Semanal:  "#f59e0b",
  Mensual:  "#8b5cf6",
  Boot:     "#6b7280",
};

interface LogLine { text: string; isError: boolean; }

export function TimeshiftPage() {
  const [installed, setInstalled]     = useState<boolean | null>(null);
  const [snapshots, setSnapshots]     = useState<TimeshiftSnapshot[]>([]);
  const [loading, setLoading]         = useState(false);
  const [comment, setComment]         = useState("");
  const [creating, setCreating]       = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [lines, setLines]             = useState<LogLine[]>([]);
  const [opDone, setOpDone]           = useState(false);
  const [opSuccess, setOpSuccess]     = useState<boolean | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<boolean>("check_timeshift").then(setInstalled);
  }, []);

  useEffect(() => {
    const unsub = listen<TimeshiftEvent>("timeshift-event", (e) => {
      const ev = e.payload;
      if (ev.done) {
        setCreating(false);
        setDeleting(null);
        setOpDone(true);
        setOpSuccess(ev.exit_ok);
        if (ev.exit_ok) loadSnapshots();
      }
      setLines((prev) => [...prev, { text: ev.line, isError: ev.is_error }]);
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function loadSnapshots() {
    setLoading(true);
    setLines([]);
    setOpDone(false);
    setOpSuccess(null);
    try {
      const result = await invoke<TimeshiftSnapshot[]>("list_timeshift_snapshots");
      setSnapshots(result);
    } catch (e) {
      setLines([{ text: String(e), isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  async function createSnapshot() {
    setCreating(true);
    setOpDone(false);
    setOpSuccess(null);
    setLines([]);
    try {
      await invoke("create_timeshift_snapshot", { comment });
      setComment("");
    } catch (e) {
      setLines((p) => [...p, { text: String(e), isError: true }]);
      setCreating(false);
      setOpDone(true);
      setOpSuccess(false);
    }
  }

  async function deleteSnapshot(name: string) {
    setDeleting(name);
    setConfirmDelete(null);
    setOpDone(false);
    setOpSuccess(null);
    setLines([]);
    try {
      await invoke("delete_timeshift_snapshot", { name });
    } catch (e) {
      setLines((p) => [...p, { text: String(e), isError: true }]);
      setDeleting(null);
      setOpDone(true);
      setOpSuccess(false);
    }
  }

  function formatSnapshotDate(name: string) {
    // "2024-01-15_10-30-01" → "15 Ene 2024 10:30"
    const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})/);
    if (!m) return name;
    const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  // ── Not installed ──────────────────────────────────────────────────────────
  if (installed === false) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-[#6b7280]">
        <AlertTriangle size={36} className="text-[#f59e0b] opacity-70" />
        <p className="text-sm font-medium text-[#e5e7eb]">Timeshift no está instalado</p>
        <p className="text-xs text-center max-w-xs">
          Instalalo con:
        </p>
        <code className="text-xs bg-[#1e1e1e] border border-[#2e2e2e] rounded px-3 py-2 text-[#10b981]">
          sudo apt install timeshift
        </code>
      </div>
    );
  }

  const busy = creating || !!deleting;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-[#10b981]" />
          <div>
            <h2 className="text-sm font-semibold text-[#e5e7eb]">Timeshift</h2>
            <p className="text-xs text-[#6b7280]">Snapshots del sistema</p>
          </div>
        </div>
        <button
          onClick={loadSnapshots}
          disabled={loading || busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-[#3a3a3a] text-[#9ca3af] hover:text-white hover:border-[#4a4a4a] disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {/* pkexec note */}
      <div className="flex items-start gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg">
        <AlertTriangle size={13} className="text-[#f59e0b] shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#9ca3af]">
          Timeshift requiere privilegios de root. Al crear o eliminar snapshots,
          el sistema mostrará un diálogo de autenticación.
        </p>
      </div>

      {/* Create snapshot */}
      <div className="border border-[#2e2e2e] rounded-lg p-4 bg-[#161616] flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Crear snapshot</h3>
        <div className="flex gap-2">
          <input
            placeholder="Comentario (opcional, ej: antes de actualizar)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={busy}
            className="flex-1 bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] outline-none focus:border-[#3b82f6] disabled:opacity-50"
          />
          <button
            onClick={createSnapshot}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium bg-[#10b981] text-white hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {creating ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
            {creating ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>

      {/* Output terminal */}
      {(lines.length > 0 || busy) && (
        <div className="border border-[#2e2e2e] rounded-lg bg-[#0d0d0d] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] border-b border-[#2e2e2e]">
            {busy      && <Loader size={13} className="text-[#3b82f6] animate-spin" />}
            {opDone && opSuccess  && <CheckCircle size={13} className="text-[#10b981]" />}
            {opDone && !opSuccess && <XCircle size={13} className="text-[#ef4444]" />}
            <span className="text-xs text-[#9ca3af]">
              {busy ? "Ejecutando timeshift..." : opDone ? (opSuccess ? "Completado" : "Error") : "Salida"}
            </span>
          </div>
          <div className="h-36 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
            {lines.map((l, i) => (
              <div key={i} className={l.isError ? "text-[#ef4444]" : "text-[#9ca3af]"}>{l.text}</div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Snapshot list */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-[#6b7280]" />
          <span className="text-xs text-[#6b7280] font-medium">
            {snapshots.length > 0 ? `${snapshots.length} snapshot${snapshots.length > 1 ? "s" : ""}` : "Sin snapshots"}
          </span>
        </div>

        {snapshots.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 py-8 text-[#6b7280]">
            <ShieldCheck size={28} className="opacity-20" />
            <span className="text-xs">Presioná "Actualizar" para cargar los snapshots</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {snapshots.map((snap) => (
            <div key={snap.name}
              className="flex items-center gap-3 px-4 py-3 bg-[#161616] rounded-lg border border-[#2e2e2e]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-[#e5e7eb] font-mono">
                    {formatSnapshotDate(snap.name)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: TAG_COLORS[snap.tags] + "30", color: TAG_COLORS[snap.tags] ?? "#9ca3af" }}>
                    {snap.tags}
                  </span>
                </div>
                <div className="text-[11px] text-[#6b7280] font-mono">{snap.name}</div>
                {snap.comment && (
                  <div className="text-[11px] text-[#9ca3af] mt-0.5 italic">"{snap.comment}"</div>
                )}
              </div>

              {confirmDelete === snap.name ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-[#f59e0b]">¿Eliminar?</span>
                  <button onClick={() => deleteSnapshot(snap.name)} disabled={busy}
                    className="px-2 py-1 rounded text-[11px] bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50 transition-colors">
                    Sí
                  </button>
                  <button onClick={() => setConfirmDelete(null)}
                    className="px-2 py-1 rounded text-[11px] border border-[#3a3a3a] text-[#9ca3af] hover:text-white transition-colors">
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(snap.name)}
                  disabled={busy}
                  className="p-1.5 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#2e2e2e] disabled:opacity-30 transition-colors"
                >
                  {deleting === snap.name
                    ? <Loader size={14} className="animate-spin text-[#ef4444]" />
                    : <Trash2 size={14} />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

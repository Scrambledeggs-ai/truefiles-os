import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Calendar } from "lucide-react";
import type { CronJob, RsyncMode } from "../lib/types";
import { cronDescription } from "../lib/utils";

const PRESETS = [
  { label: "Cada hora", value: "0 * * * *" },
  { label: "Diario 2am", value: "0 2 * * *" },
  { label: "Semanal Dom 3am", value: "0 3 * * 0" },
  { label: "Mensual día 1", value: "0 2 1 * *" },
  { label: "Personalizado", value: "custom" },
];

const MODES: { id: RsyncMode; label: string }[] = [
  { id: "mirror", label: "Mirror" },
  { id: "sync", label: "Sync" },
  { id: "incremental", label: "Incremental" },
  { id: "dry-run", label: "Dry Run" },
];

export function SchedulePage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [src, setSrc] = useState("");
  const [dst, setDst] = useState("");
  const [mode, setMode] = useState<RsyncMode>("sync");
  const [preset, setPreset] = useState("0 2 * * *");
  const [customCron, setCustomCron] = useState("0 2 * * *");
  const [saving, setSaving] = useState(false);

  const schedule = preset === "custom" ? customCron : preset;

  async function loadJobs() {
    try {
      const result = await invoke<CronJob[]>("list_cron_jobs");
      setJobs(result);
    } catch (_) {
      setJobs([]);
    }
  }

  useEffect(() => { loadJobs(); }, []);

  async function addJob() {
    if (!label || !src || !dst) return;
    setSaving(true);
    try {
      await invoke("add_cron_job", { schedule, src, dst, mode, label });
      setShowForm(false);
      setLabel(""); setSrc(""); setDst("");
      await loadJobs();
    } finally {
      setSaving(false);
    }
  }

  async function removeJob(id: string) {
    await invoke("remove_cron_job", { id });
    await loadJobs();
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e7eb]">Tareas programadas</h2>
          <p className="text-xs text-[#6b7280]">Administra los cronjobs de rsync</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
        >
          <Plus size={13} />
          Nueva tarea
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-[#2e2e2e] rounded-lg p-4 bg-[#161616] flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Nueva tarea</h3>

          <input
            placeholder="Nombre (ej: Fotos → NAS)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] outline-none focus:border-[#3b82f6]"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Origen (ruta)"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]"
            />
            <input
              placeholder="Destino (ruta)"
              value={dst}
              onChange={(e) => setDst(e.target.value)}
              className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]"
            />
          </div>

          <div className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 rounded text-xs transition-colors ${
                  mode === m.id
                    ? "bg-[#3b82f6] text-white"
                    : "bg-[#1e1e1e] border border-[#3a3a3a] text-[#9ca3af] hover:border-[#4a4a4a]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[11px] text-[#6b7280] block mb-1.5">Frecuencia</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={`px-3 py-1.5 rounded text-xs transition-colors ${
                    preset === p.value
                      ? "bg-[#262626] border border-[#3b82f6] text-[#e5e7eb]"
                      : "bg-[#1e1e1e] border border-[#3a3a3a] text-[#9ca3af] hover:border-[#4a4a4a]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <input
                placeholder="Cron expression (ej: 0 3 * * 1)"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                className="mt-2 w-full bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]"
              />
            )}
            <p className="text-[11px] text-[#6b7280] mt-1">
              {cronDescription(schedule)}
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded text-xs text-[#9ca3af] hover:text-[#e5e7eb] border border-[#3a3a3a] hover:border-[#4a4a4a]"
            >
              Cancelar
            </button>
            <button
              onClick={addJob}
              disabled={saving || !label || !src || !dst}
              className="px-4 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-[#6b7280]">
          <Calendar size={32} className="opacity-30" />
          <span className="text-xs">No hay tareas programadas</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 px-4 py-3 bg-[#161616] rounded-lg border border-[#2e2e2e]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-[#e5e7eb]">{job.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e3a5f] text-[#60a5fa]">
                    {job.mode}
                  </span>
                </div>
                <div className="text-[11px] text-[#6b7280] font-mono truncate">
                  {job.src} → {job.dst}
                </div>
                <div className="text-[11px] text-[#9ca3af] mt-0.5">
                  {cronDescription(job.schedule)}
                  <span className="text-[#4b5563] ml-2 font-mono">{job.schedule}</span>
                </div>
              </div>
              <button
                onClick={() => removeJob(job.id)}
                className="p-1.5 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#2e2e2e] transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

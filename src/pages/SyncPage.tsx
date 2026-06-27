import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, ArrowRight, Gauge } from "lucide-react";
import { FileBrowser } from "../components/FileBrowser";
import { RsyncModeSelector } from "../components/RsyncModeSelector";
import { SyncProgress } from "../components/SyncProgress";
import { ExcludesEditor } from "../components/ExcludesEditor";
import type { RsyncMode, RsyncEvent, SshProfile, PaneState } from "../lib/types";

interface LogLine { text: string; isError: boolean; }

function formatBw(kbps: number): string {
  if (kbps === 0) return "Sin límite";
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
  return `${kbps} KB/s`;
}

export function SyncPage() {
  const [src, setSrc]           = useState<PaneState>({ path: "/home", mode: "local", profileId: null });
  const [dst, setDst]           = useState<PaneState>({ path: "/mnt", mode: "local", profileId: null });
  const [mode, setMode]         = useState<RsyncMode>("sync");
  const [profiles, setProfiles] = useState<SshProfile[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [bwlimit, setBwlimit]   = useState(0);       // 0 = unlimited (KB/s)
  const [lines, setLines]       = useState<LogLine[]>([]);
  const [running, setRunning]   = useState(false);
  const [done, setDone]         = useState(false);
  const [success, setSuccess]   = useState<boolean | null>(null);

  useEffect(() => {
    invoke<string>("get_home_dir").then((home) => setSrc((s) => ({ ...s, path: home })));
    invoke<SshProfile[]>("list_ssh_profiles").then(setProfiles);
  }, []);

  const handleEvent = useCallback((e: RsyncEvent) => {
    if (e.done) { setRunning(false); setDone(true); setSuccess(e.exit_ok); }
    setLines((prev) => [...prev, { text: e.line, isError: e.is_error }]);
  }, []);

  async function startSync() {
    setLines([]);
    setDone(false);
    setSuccess(null);
    setRunning(true);
    try {
      await invoke("run_rsync", {
        src: src.path.endsWith("/") ? src.path : src.path + "/",
        dst: dst.path,
        mode,
        excludes,
        bwlimit: bwlimit > 0 ? bwlimit : null,
        srcProfileId: src.mode === "ssh" ? src.profileId : null,
        dstProfileId: dst.mode === "ssh" ? dst.profileId : null,
      });
    } catch (e) {
      setLines((prev) => [...prev, { text: String(e), isError: true }]);
      setRunning(false);
      setDone(true);
      setSuccess(false);
    }
  }

  const srcLabel = src.mode === "ssh" && src.profileId
    ? profiles.find((p) => p.id === src.profileId)?.name ?? "SSH"
    : src.path;
  const dstLabel = dst.mode === "ssh" && dst.profileId
    ? profiles.find((p) => p.id === dst.profileId)?.name ?? "SSH"
    : dst.path;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-4">
      {/* Dual pane */}
      <div className="grid grid-cols-2 gap-3" style={{ height: "320px" }}>
        <FileBrowser label="ORIGEN" pane={src} profiles={profiles}
          onPaneChange={(p) => setSrc((s) => ({ ...s, ...p }))} />
        <FileBrowser label="DESTINO" pane={dst} profiles={profiles}
          onPaneChange={(p) => setDst((s) => ({ ...s, ...p }))} />
      </div>

      {/* Route indicator */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] rounded-lg border border-[#2e2e2e] text-xs font-mono overflow-hidden">
        <span className="text-[#6b7280] shrink-0">rsync</span>
        <span className="text-[#3b82f6] truncate">{srcLabel}/</span>
        <ArrowRight size={13} className="text-[#6b7280] shrink-0" />
        <span className="text-[#10b981] truncate">{dstLabel}</span>
      </div>

      {/* Mode selector */}
      <RsyncModeSelector selected={mode} onChange={setMode} />

      {/* Excludes */}
      <ExcludesEditor excludes={excludes} onChange={setExcludes} />

      {/* Bandwidth */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#161616] rounded-lg border border-[#2e2e2e]">
        <Gauge size={14} className="text-[#6b7280] shrink-0" />
        <span className="text-xs text-[#9ca3af] shrink-0">Velocidad</span>
        <input
          type="range" min={0} max={10240} step={128}
          value={bwlimit}
          onChange={(e) => setBwlimit(Number(e.target.value))}
          className="flex-1 accent-[#3b82f6]"
        />
        <span className="text-xs font-mono w-24 text-right"
          style={{ color: bwlimit === 0 ? "#6b7280" : "#3b82f6" }}>
          {formatBw(bwlimit)}
        </span>
      </div>

      {/* Sync button */}
      <button onClick={startSync} disabled={running}
        className="flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: running ? "#1d3a6b" : "#3b82f6", color: "#fff" }}
      >
        <Play size={15} />
        {running ? "Sincronizando..." : "Sync Now"}
      </button>

      {/* Progress */}
      <SyncProgress lines={lines} running={running} done={done} success={success} onEvent={handleEvent} />
    </div>
  );
}

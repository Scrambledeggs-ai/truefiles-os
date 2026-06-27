import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle, XCircle, Loader } from "lucide-react";
import type { RsyncEvent } from "../lib/types";

interface LogLine {
  text: string;
  isError: boolean;
}

interface Props {
  lines: LogLine[];
  running: boolean;
  done: boolean;
  success: boolean | null;
  onEvent: (e: RsyncEvent) => void;
}

export function SyncProgress({ lines, running, done, success, onEvent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<RsyncEvent>("rsync-event", (event) => {
      onEvent(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [onEvent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  if (!running && !done && lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-[#6b7280] text-xs border border-[#2e2e2e] rounded-lg bg-[#161616]">
        El output de rsync aparecerá aquí
      </div>
    );
  }

  return (
    <div className="border border-[#2e2e2e] rounded-lg bg-[#0d0d0d] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161616] border-b border-[#2e2e2e]">
        {running && <Loader size={13} className="text-[#3b82f6] animate-spin" />}
        {done && success && <CheckCircle size={13} className="text-[#10b981]" />}
        {done && !success && <XCircle size={13} className="text-[#ef4444]" />}
        <span className="text-xs text-[#9ca3af]">
          {running ? "Sincronizando..." : done ? (success ? "Completado" : "Error") : "Salida"}
        </span>
      </div>
      <div className="h-48 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {lines.map((l, i) => (
          <div key={i} className={l.isError ? "text-[#ef4444]" : "text-[#9ca3af]"}>
            {l.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

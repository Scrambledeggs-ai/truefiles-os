import { Trash2, RefreshCw, Layers, Eye } from "lucide-react";
import type { RsyncMode } from "../lib/types";

interface Mode {
  id: RsyncMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  flag: string;
}

const MODES: Mode[] = [
  {
    id: "mirror",
    label: "Mirror",
    desc: "Copia exacta. Borra en destino lo que no está en origen.",
    icon: <Trash2 size={18} />,
    color: "#ef4444",
    flag: "--delete",
  },
  {
    id: "sync",
    label: "Sync",
    desc: "Solo copia archivos más nuevos. No borra nada.",
    icon: <RefreshCw size={18} />,
    color: "#3b82f6",
    flag: "--update",
  },
  {
    id: "incremental",
    label: "Incremental",
    desc: "Copia y guarda versiones anteriores en backup.",
    icon: <Layers size={18} />,
    color: "#10b981",
    flag: "--backup",
  },
  {
    id: "dry-run",
    label: "Dry Run",
    desc: "Simula sin copiar nada. Para verificar antes de actuar.",
    icon: <Eye size={18} />,
    color: "#f59e0b",
    flag: "--dry-run",
  },
];

interface Props {
  selected: RsyncMode;
  onChange: (m: RsyncMode) => void;
}

export function RsyncModeSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {MODES.map((m) => {
        const active = selected === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`flex-1 flex flex-col gap-1.5 px-3 py-3 rounded-lg border text-left transition-all ${
              active
                ? "border-current bg-[#1a1a1a]"
                : "border-[#2e2e2e] bg-[#1a1a1a] hover:border-[#3e3e3e]"
            }`}
            style={active ? { borderColor: m.color, color: m.color } : { color: "#9ca3af" }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: active ? m.color : "#6b7280" }}>{m.icon}</span>
              <span className="font-semibold text-sm" style={{ color: active ? m.color : "#e5e7eb" }}>
                {m.label}
              </span>
            </div>
            <p className="text-[11px] leading-tight" style={{ color: "#9ca3af" }}>
              {m.desc}
            </p>
            <code className="text-[10px] font-mono" style={{ color: "#6b7280" }}>
              {m.flag}
            </code>
          </button>
        );
      })}
    </div>
  );
}

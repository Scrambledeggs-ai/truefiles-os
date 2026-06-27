import { Calendar, Clock, RefreshCw, Wifi, ShieldCheck, Tag, Copy } from "lucide-react";
import type { Page } from "../lib/types";

interface Props {
  current: Page;
  onChange: (p: Page) => void;
}

const nav: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "sync",        label: "Sync",        icon: <RefreshCw size={16} /> },
  { id: "schedule",    label: "Programar",   icon: <Calendar size={16} /> },
  { id: "connections", label: "SSH / VPS",   icon: <Wifi size={16} /> },
  { id: "tags",        label: "Tags",         icon: <Tag size={16} /> },
  { id: "duplicates",  label: "Duplicados",   icon: <Copy size={16} /> },
  { id: "timeshift",   label: "Timeshift",   icon: <ShieldCheck size={16} /> },
  { id: "history",     label: "Historial",   icon: <Clock size={16} /> },
];

export function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="flex flex-col w-48 shrink-0 border-r border-[#2e2e2e] bg-[#161616] h-full">
      <div className="px-4 py-5 border-b border-[#2e2e2e]">
        <span className="text-white font-semibold tracking-wide text-sm">Truefiles OS</span>
        <span className="text-[#6b7280] text-xs block">v0.1</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-2 mt-1">
        {nav.map(({ id, label, icon }) => (
          <button key={id} onClick={() => onChange(id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded text-left text-sm transition-colors ${
              current === id
                ? "bg-[#3b82f6] text-white"
                : "text-[#9ca3af] hover:bg-[#262626] hover:text-[#e5e7eb]"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

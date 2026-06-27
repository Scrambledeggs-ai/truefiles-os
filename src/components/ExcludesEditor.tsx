import { useState } from "react";
import { X, Plus } from "lucide-react";

const PRESETS: { label: string; pattern: string; desc: string }[] = [
  { label: ".git/",          pattern: ".git/",          desc: "Repositorios Git" },
  { label: "node_modules/",  pattern: "node_modules/",  desc: "Dependencias JS/Node" },
  { label: "__pycache__/",   pattern: "__pycache__/",   desc: "Caché Python" },
  { label: ".cache/",        pattern: ".cache/",        desc: "Caché del sistema" },
  { label: "*.tmp",          pattern: "*.tmp",          desc: "Archivos temporales" },
  { label: "*.log",          pattern: "*.log",          desc: "Archivos de log" },
  { label: "Trash/",         pattern: "Trash/",         desc: "Papelera" },
  { label: ".Trash-*/",      pattern: ".Trash-*/",      desc: "Papelera (oculta)" },
];

interface Props {
  excludes: string[];
  onChange: (excludes: string[]) => void;
}

export function ExcludesEditor({ excludes, onChange }: Props) {
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);

  function toggle(pattern: string) {
    if (excludes.includes(pattern)) {
      onChange(excludes.filter((e) => e !== pattern));
    } else {
      onChange([...excludes, pattern]);
    }
  }

  function addCustom() {
    const p = custom.trim();
    if (p && !excludes.includes(p)) {
      onChange([...excludes, p]);
    }
    setCustom("");
  }

  function remove(pattern: string) {
    onChange(excludes.filter((e) => e !== pattern));
  }

  return (
    <div className="border border-[#2e2e2e] rounded-lg bg-[#161616] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-[#9ca3af] hover:text-[#e5e7eb] transition-colors"
      >
        <span className="font-medium">
          Exclusiones
          {excludes.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#1d3a6b] text-[#60a5fa] text-[10px]">
              {excludes.length} activa{excludes.length > 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="text-[#4b5563]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[#2e2e2e]">
          <p className="text-[11px] text-[#6b7280] pt-3">
            Seleccioná los patrones que querés omitir del sync:
          </p>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = excludes.includes(p.pattern);
              return (
                <button
                  key={p.pattern}
                  onClick={() => toggle(p.pattern)}
                  title={p.desc}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                    active
                      ? "bg-[#1d3a6b] border-[#3b82f6] text-[#60a5fa]"
                      : "bg-[#1e1e1e] border-[#3a3a3a] text-[#6b7280] hover:border-[#4a4a4a] hover:text-[#9ca3af]"
                  }`}
                >
                  {active && <X size={9} />}
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom input */}
          <div className="flex gap-2">
            <input
              placeholder="Patrón personalizado (ej: *.bak, temp/)"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              className="flex-1 bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-1.5 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]"
            />
            <button
              onClick={addCustom}
              disabled={!custom.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs border border-[#3a3a3a] text-[#9ca3af] hover:text-white hover:border-[#4a4a4a] disabled:opacity-40 transition-colors"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>

          {/* Active custom excludes (non-preset) */}
          {excludes.filter((e) => !PRESETS.find((p) => p.pattern === e)).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {excludes
                .filter((e) => !PRESETS.find((p) => p.pattern === e))
                .map((e) => (
                  <span key={e}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#3a3a3a] text-[11px] font-mono text-[#9ca3af]">
                    {e}
                    <button onClick={() => remove(e)} className="hover:text-[#ef4444] transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { tagColor } from "../lib/utils";

interface TagEntry { tag: string }

interface Props {
  existingTags: TagEntry[];
  currentTags: string[];
  onAdd: (tag: string) => void;
  onClose: () => void;
}

export function TagInlineEditor({ existingTags, currentTags, onAdd, onClose }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  }, []);

  const suggestions = existingTags.filter((t) =>
    input.length > 0 &&
    t.tag.includes(input.toLowerCase()) &&
    !currentTags.includes(t.tag)
  );

  function submit(tag: string) {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (normalized && !currentTags.includes(normalized)) onAdd(normalized);
    onClose();
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          autoFocus
          placeholder="nuevo tag..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter")  submit(input);
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown" && suggestions[0]) submit(suggestions[0].tag);
          }}
          className="bg-[#1e1e1e] border border-[#3b82f6] rounded px-2 py-0.5 text-[11px] text-[#e5e7eb] w-28 outline-none font-mono"
        />
        <button onClick={() => submit(input)}
          className="text-[#3b82f6] hover:text-white transition-colors">
          <Plus size={13} />
        </button>
        <button onClick={onClose}
          className="text-[#6b7280] hover:text-[#e5e7eb] transition-colors">
          <X size={12} />
        </button>
      </div>

      {pos && suggestions.length > 0 && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-[#1e1e1e] border border-[#3a3a3a] rounded shadow-xl min-w-[140px] overflow-hidden">
          {suggestions.slice(0, 6).map(({ tag }) => (
            <button key={tag}
              onMouseDown={(e) => { e.preventDefault(); submit(tag); }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-[#9ca3af] hover:bg-[#262626] hover:text-white transition-colors text-left">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tagColor(tag) }} />
              {tag}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

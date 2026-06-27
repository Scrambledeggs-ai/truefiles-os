import { X } from "lucide-react";
import { tagColor } from "../lib/utils";

interface Props {
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
  size?: "sm" | "md";
}

export function TagChip({ tag, onRemove, onClick, size = "sm" }: Props) {
  const color = tagColor(tag);
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${pad} ${onClick ? "cursor-pointer" : ""}`}
      style={{ background: color + "22", color, border: `1px solid ${color}44` }}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70 transition-opacity"
        >
          <X size={9} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

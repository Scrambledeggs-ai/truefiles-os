export function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDate(unixSecs: number): string {
  if (!unixSecs) return "—";
  return new Date(unixSecs * 1000).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function tagColor(tag: string): string {
  const palette = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316","#a78bfa"];
  let h = 0;
  for (const c of tag) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export function cronDescription(schedule: string): string {
  const parts = schedule.split(" ");
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, , dow] = parts;

  if (min === "0" && dom === "*" && dow === "*") {
    const h = hour === "*" ? "cada hora" : `${hour}:00`;
    return hour === "*" ? "Cada hora" : `Diario a las ${h}`;
  }
  if (dom === "*" && dow !== "*") {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return `Semanal los ${days[parseInt(dow)] ?? dow} a las ${hour}:${min.padStart(2, "0")}`;
  }
  if (dom !== "*" && dow === "*") {
    return `Mensual el día ${dom} a las ${hour}:${min.padStart(2, "0")}`;
  }
  return schedule;
}

import { cn } from "@/lib/utils";

export function Progress({ value, tone = "blue", className, label }: {
  value: number; tone?: "blue" | "green" | "violet" | "red" | "amber"; className?: string; label?: string;
}) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = {
    blue: "bg-gradient-to-l from-[#4fb0ff] to-[#2a7fe0]",
    green: "bg-gradient-to-l from-[#2fe0ab] to-[#16a87d]",
    violet: "bg-gradient-to-l from-[#a493ff] to-[#6c5ce7]",
    red: "bg-danger", amber: "bg-warn",
  }[tone];
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-[#0b1a2c] border border-line/60", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

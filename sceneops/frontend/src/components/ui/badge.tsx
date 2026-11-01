import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5", {
  variants: {
    tone: {
      blue: "border-accent/40 bg-accent/10 text-accent",
      green: "border-ok/40 bg-ok/10 text-ok",
      amber: "border-warn/40 bg-warn/10 text-warn",
      red: "border-danger/40 bg-danger/10 text-danger",
      violet: "border-violet/40 bg-violet/10 text-violet",
      gray: "border-line bg-white/5 text-ink-2",
    },
  },
  defaultVariants: { tone: "gray" },
});

export function Badge({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

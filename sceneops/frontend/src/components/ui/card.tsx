import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line/80 bg-card/70 shadow-card backdrop-blur", className)} {...p} />;
}

export function CardHeader({ title, icon, actions, className, subtitle }: {
  title: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string; subtitle?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-accent [&_svg]:size-5">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink truncate">{title}</h2>
          {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...p} />;
}

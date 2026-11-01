import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** עטיפה לטקסט טכני משמאל-לימין (IP, נתיבים, Hash, שמות קבצים) בתוך ממשק RTL */
export function Ltr({ children, className, mono }: { children: ReactNode; className?: string; mono?: boolean }) {
  return <bdi dir="ltr" className={cn("unicode-bidi-isolate", mono && "font-mono text-[0.92em]", className)}>{children}</bdi>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/[0.06]", className)} aria-hidden />;
}

export function Loading({ label = "טוען נתונים…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-ink-3">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: {
  title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="text-ink-3 [&_svg]:size-9">{icon ?? <Inbox />}</span>
      <p className="font-semibold text-ink-2">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : "אירעה שגיאה";
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center">
      <AlertTriangle className="size-8 text-danger" />
      <p className="text-ink-2">{msg}</p>
      {retry && <button onClick={retry} className="text-sm text-accent hover:underline">נסו שוב</button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: {
  title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl md:text-[28px] font-extrabold text-ink">
          {icon && <span className="text-accent [&_svg]:size-7">{icon}</span>}{title}
        </h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SimBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border border-warn/50 bg-warn/10 px-1.5 py-0.5 text-[11px] font-semibold text-warn", className)}>
      סימולציה
    </span>
  );
}

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-sm text-ink break-words">{children || "—"}</dd>
    </div>
  );
}

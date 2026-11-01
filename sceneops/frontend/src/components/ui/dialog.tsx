import type { ReactNode } from "react";
import * as D from "@radix-ui/react-dialog";
import * as AD from "@radix-ui/react-alert-dialog";
import { X, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode;
  footer?: ReactNode; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#020812]/75 backdrop-blur-sm data-[state=open]:animate-in" />
        <D.Content dir="rtl"
          className={cn("fixed z-50 inset-x-3 top-[6vh] mx-auto max-h-[88vh] overflow-y-auto rounded-2xl border border-line",
            "bg-[#0f2036] shadow-2xl focus:outline-none", wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-4">
            <div>
              <D.Title className="text-lg font-bold text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-3">{description}</D.Description>
                : <D.Description className="sr-only">{typeof title === "string" ? title : "חלון"}</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label="סגירה"><X /></Button>
            </D.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-start gap-2 border-t border-line/70 px-6 py-4">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** חלון אישור לפעולות רגישות */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "אישור", onConfirm, danger,
  loading, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description: ReactNode; confirmLabel?: string;
  onConfirm: () => void; danger?: boolean; loading?: boolean; children?: ReactNode;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-50 bg-[#020812]/75 backdrop-blur-sm" />
        <AD.Content dir="rtl" className="fixed z-50 inset-x-3 top-[18vh] mx-auto max-w-md rounded-2xl border border-line bg-[#0f2036] p-6 shadow-2xl">
          <div className="flex gap-3">
            <span className={cn("mt-0.5 shrink-0", danger ? "text-danger" : "text-warn")}><ShieldAlert className="size-6" /></span>
            <div className="space-y-2">
              <AD.Title className="text-lg font-bold">{title}</AD.Title>
              <AD.Description className="text-sm text-ink-2 leading-relaxed">{description}</AD.Description>
              {children}
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant={danger ? "danger" : "default"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
            <AD.Cancel asChild><Button variant="secondary">ביטול</Button></AD.Cancel>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}

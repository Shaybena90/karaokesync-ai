import * as T from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ value, onValueChange, tabs, children, className }: {
  value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode }[]; children: ReactNode;
  className?: string;
}) {
  return (
    <T.Root dir="rtl" value={value} onValueChange={onValueChange} className={className}>
      <T.List className="flex gap-1 overflow-x-auto border-b border-line/70 mb-4" aria-label="לשוניות">
        {tabs.map((t) => (
          <T.Trigger key={t.value} value={t.value}
            className={cn("relative px-4 py-2.5 text-sm font-medium text-ink-3 whitespace-nowrap transition-colors",
              "hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-md",
              "data-[state=active]:text-accent data-[state=active]:after:absolute data-[state=active]:after:inset-x-2",
              "data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-accent")}>
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = T.Content;

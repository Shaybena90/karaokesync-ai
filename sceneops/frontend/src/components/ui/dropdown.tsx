import * as DM from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export function Dropdown({ trigger, items }: {
  trigger: ReactNode; items: { label: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean }[];
}) {
  return (
    <DM.Root dir="rtl">
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6} className="z-50 min-w-[190px] rounded-xl border border-line bg-[#0f2036] p-1.5 shadow-2xl">
          {items.map((it, i) => (
            <DM.Item key={i} onSelect={it.onSelect}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-white/5 ${it.danger ? "text-danger" : "text-ink"}`}>
              {it.icon}{it.label}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

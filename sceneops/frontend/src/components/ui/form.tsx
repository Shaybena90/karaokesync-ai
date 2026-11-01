import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes, cloneElement, isValidElement, type ReactElement } from "react";
import { cn } from "@/lib/utils";

const base = "w-full rounded-lg border border-line bg-[#0c1b2e] px-3 text-sm text-ink placeholder:text-ink-3 " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, "h-10", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(base, "min-h-[84px] py-2", className)} {...p} />,
);
Textarea.displayName = "Textarea";

const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237F93AB' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, style, ...p }, ref) => (
    <select ref={ref} className={cn(base, "h-10 pe-3 ps-8 appearance-none", className)}
      style={{ backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundSize: "14px", backgroundPosition: "left 10px center", ...style }}
      {...p}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

/** שדה טופס עם תווית, הסבר ושגיאה – מקושר לנגישות */
export function Field({ label, hint, error, required, children, className }: {
  label: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactElement; className?: string;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errId : undefined,
        "aria-required": required || undefined,
      })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label}{required && <span className="text-danger ms-0.5" aria-hidden>*</span>}
      </label>
      {child}
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, id, disabled }: {
  label: ReactNode; checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean;
}) {
  const gen = useId();
  const cid = id ?? gen;
  return (
    <label htmlFor={cid} className="flex items-start gap-2.5 text-sm text-ink-2 cursor-pointer select-none">
      <input id={cid} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-line bg-[#0c1b2e] accent-[#319BFF]" />
      <span>{label}</span>
    </label>
  );
}

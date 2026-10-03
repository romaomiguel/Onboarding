import * as React from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted read-only:bg-muted read-only:font-semibold';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-10', className)} {...p} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[84px] py-2', className)} {...p} />,
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select ref={ref} className={cn(field, 'h-10', className)} {...p}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Field({ label, hint, className, required, children }: { label: string; hint?: string; className?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}
        {required && <span className="ml-0.5 text-base leading-none text-red-600" title="Obrigatório"> *</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Check({ checked, onChange, children, className }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 rounded-md border border-input bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted has-[:checked]:border-secondary has-[:checked]:bg-secondary/5', className)}>
      <input type="checkbox" className="size-4 accent-[hsl(var(--secondary))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

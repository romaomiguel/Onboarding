import { cn } from '@/lib/utils';

const tones = {
  gray: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-secondary/10 text-secondary',
  red: 'bg-accent text-accent-foreground',
};

export function Badge({ tone = 'gray', className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

export const toneStatus = (s: string): keyof typeof tones =>
  s === 'Concluído' ? 'green' : s === 'Em andamento' ? 'amber' : 'gray';

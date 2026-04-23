import { cn, statusColor } from '@/lib/utils';

interface BadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusColor(status), className)}>
      {status || '—'}
    </span>
  );
}

interface TagProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'slate' | 'purple';
  className?: string;
}

const tagColors = {
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-emerald-100 text-emerald-700',
  red:    'bg-red-100 text-red-700',
  amber:  'bg-amber-100 text-amber-700',
  slate:  'bg-slate-100 text-slate-600',
  purple: 'bg-purple-100 text-purple-700',
};

export function Tag({ children, color = 'slate', className }: TagProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', tagColors[color], className)}>
      {children}
    </span>
  );
}

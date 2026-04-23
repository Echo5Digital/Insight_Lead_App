import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin', className)} />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner className="w-8 h-8 text-brand" />
    </div>
  );
}

export function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="table-td">
          <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard() {
  return (
    <div className="stat-card animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-slate-200 rounded w-1/3" />
    </div>
  );
}

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pages, total, limit, onChange }: PaginationProps) {
  if (pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      <p className="text-sm text-slate-500">Showing <span className="font-medium">{from}–{to}</span> of <span className="font-medium">{total}</span></p>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          let p = i + 1;
          if (pages > 7) {
            if (page <= 4) p = i + 1;
            else if (page >= pages - 3) p = pages - 6 + i;
            else p = page - 3 + i;
          }
          return (
            <button key={p} onClick={() => onChange(p)}
              className={cn('w-8 h-8 rounded-lg text-sm font-medium transition-colors', p === page ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100')}>
              {p}
            </button>
          );
        })}
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

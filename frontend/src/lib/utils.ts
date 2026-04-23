import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(val?: string | null): string {
  if (!val) return '—';
  try { return format(new Date(val), 'MMM d, yyyy'); } catch { return '—'; }
}

export function fmtDateShort(val?: string | null): string {
  if (!val) return '—';
  try { return format(new Date(val), 'M/d/yy'); } catch { return '—'; }
}

export function timeAgo(val?: string | null): string {
  if (!val) return '—';
  try { return formatDistanceToNow(new Date(val), { addSuffix: true }); } catch { return '—'; }
}

export function toInputDate(val?: string | null): string {
  if (!val) return '';
  try { return format(new Date(val), 'yyyy-MM-dd'); } catch { return ''; }
}

export function fmtCurrency(val?: number | null): string {
  if (val == null) return '—';
  return `$${val.toFixed(2)}`;
}

export function statusColor(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'complete':            return 'bg-emerald-100 text-emerald-700';
    case 'in progress':         return 'bg-blue-100 text-blue-700';
    case 'on hold':             return 'bg-amber-100 text-amber-700';
    case 'denied':              return 'bg-red-100 text-red-700';
    case 'not moving forward':  return 'bg-slate-100 text-slate-600';
    case 'no response':         return 'bg-orange-100 text-orange-700';
    case 'new':                 return 'bg-purple-100 text-purple-700';
    case 'contacted':           return 'bg-blue-100 text-blue-700';
    case 'forms sent':          return 'bg-cyan-100 text-cyan-700';
    case 'converted':           return 'bg-emerald-100 text-emerald-700';
    default:                    return 'bg-slate-100 text-slate-600';
  }
}

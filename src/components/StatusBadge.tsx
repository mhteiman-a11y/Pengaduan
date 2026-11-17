import { CheckCircle2, Clock, FileCheck2, SearchCheck, XCircle } from 'lucide-react';
import { ComplaintStatus } from '../types/sippandu';

const STATUS_META: Record<
  ComplaintStatus,
  {
    label: string;
    classes: string;
    Icon: typeof Clock;
  }
> = {
  PENDING: {
    label: 'Menunggu Verifikasi',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Clock,
  },
  IN_REVIEW: {
    label: 'Sedang Diverifikasi',
    classes: 'bg-amber-50 text-amber-800 border-amber-300',
    Icon: SearchCheck,
  },
  ACCEPTED: {
    label: 'Disetujui · Terjadwal',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Ditolak / Perbaikan',
    classes: 'bg-red-50 text-red-800 border-red-200',
    Icon: XCircle,
  },
  COMPLETED: {
    label: 'Selesai Diterbitkan',
    classes: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    Icon: FileCheck2,
  },
};

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${meta.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

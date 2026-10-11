const STATUS_STYLES: Record<string, string> = {
  pending: 'border-yellow-500/40 bg-yellow-500/20 text-yellow-400',
  confirmed: 'border-blue-500/40 bg-blue-500/20 text-blue-400',
  packed: 'border-purple-500/40 bg-purple-500/20 text-purple-400',
  shipped: 'border-orange-500/40 bg-orange-500/20 text-orange-400',
  delivered: 'border-green-500/40 bg-green-500/20 text-green-400',
  cancelled: 'border-red-500/40 bg-red-500/20 text-red-400',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[status] ?? 'border-border bg-surface text-muted-foreground'}`}>
      {status}
    </span>
  );
}

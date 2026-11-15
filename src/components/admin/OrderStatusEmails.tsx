import { formatDate, formatPaymentStatus } from '../../lib/admin';

export interface StatusEmail {
  id: string;
  order_id: string;
  order_status: string;
  sent_at: string | null;
  state: 'pending' | 'sent' | 'failed' | 'skipped';
  reason: string | null;
  retryable: boolean;
}

const colors: Record<StatusEmail['state'], string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-800',
  sent: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  failed: 'border-red-300 bg-red-50 text-red-800',
  skipped: 'border-border text-muted-foreground',
};
const reasons: Record<string, string> = {
  covered_by_confirmation: 'Covered by the original order confirmation.',
  missing_email: 'No customer email address on file.',
  superseded: 'A newer order status replaced this update.',
  pre_activation: 'Queued before automatic sending was enabled.',
  provider_rejected: 'The email provider rejected the request.',
  retry_exhausted: 'Automatic retries were exhausted.',
  safety_window: 'The safe retry window has ended.',
};

export default function OrderStatusEmails({ rows, unavailable, retrying, error, onRetry }: {
  rows: StatusEmail[];
  unavailable: boolean;
  retrying: string | null;
  error?: string;
  onRetry: (id: string) => void;
}) {
  return (
    <section className="mt-4 border-t border-border pt-4" aria-label="Customer status emails">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer status emails</h4>
      {unavailable ? <p className="mt-2 text-xs text-muted">Email statuses unavailable. Refresh orders to retry.</p>
        : rows.length === 0 ? <p className="mt-2 text-xs text-muted">No status emails recorded.</p>
        : <ul className="mt-2 space-y-2">
          {rows.map(row => <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-background p-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <strong>{formatPaymentStatus(row.order_status)}</strong>
                <span className={'rounded-full border px-2 py-0.5 font-semibold ' + colors[row.state]}>{formatPaymentStatus(row.state)}</span>
              </div>
              {row.sent_at && <p className="mt-1 text-xs text-muted-foreground">Accepted by email provider {formatDate(row.sent_at)}</p>}
              {row.reason && reasons[row.reason] && <p className="mt-1 text-xs text-muted-foreground">{reasons[row.reason]}</p>}
              {row.state === 'failed' && !row.retryable && row.reason !== 'safety_window' &&
                <p className="mt-1 text-xs text-muted-foreground">This update is no longer eligible for retry.</p>}
            </div>
            {row.retryable && <button type="button" disabled={Boolean(retrying)} onClick={() => onRetry(row.id)}
              className="btn-outline shrink-0 text-xs" aria-label={'Retry ' + row.order_status + ' email'}>
              {retrying === row.id ? 'Queuing…' : 'Retry email'}
            </button>}
          </li>)}
        </ul>}
      {error && <p role="alert" className="mt-2 text-xs text-primary">{error}</p>}
    </section>
  );
}

import { useEffect, useState } from 'react';
import {
  MessageCircle,
  CheckCircle2,
  XCircle,
  ImageOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSignedUrl } from '../../lib/storage';
import { formatDate, StatusBadge } from '../../pages/Admin';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;

function toWhatsAppLink(phone: string, customerName: string, orderReference: string): string {
  const digits = phone.replace(/\D/g, '');
  const number = digits.startsWith('94')
    ? digits
    : digits.startsWith('0')
      ? `94${digits.slice(1)}`
      : `94${digits}`;
  const message = `Hi ${customerName}, this is ComicCulture regarding your order ${orderReference}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: 'border-yellow-500/40 bg-yellow-500/20 text-yellow-400',
  awaiting_payment: 'border-orange-500/40 bg-orange-500/20 text-orange-400',
  awaiting_verification: 'border-blue-500/40 bg-blue-500/20 text-blue-400',
  paid: 'border-green-500/40 bg-green-500/20 text-green-400',
  failed: 'border-red-500/40 bg-red-500/20 text-red-400',
};

function formatPaymentStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatPaymentMethod(method: string): string {
  return method === 'BANK_TRANSFER' ? 'Bank Transfer' : method === 'COD' ? 'Cash on Delivery' : method;
}

// Payment status is normally changed only via handleVerifyPayment below
// (Confirm/Reject Payment on a Bank Transfer order awaiting verification),
// never edited freely like order status.
function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        PAYMENT_STATUS_STYLES[status] ?? 'border-border bg-surface text-muted-foreground'
      }`}
    >
      {formatPaymentStatus(status)}
    </span>
  );
}

interface OrderItemRow {
  id: string;
  name: string;
  size: string;
  quantity: number;
  price: number;
}

interface OrderRow {
  id: string;
  order_reference: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  district: string;
  postal_code: string | null;
  total: number;
  status: string;
  payment_method: string | null;
  payment_status: string;
  receipt_url: string | null;
  created_at: string;
  order_items: OrderItemRow[];
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof STATUSES)[number]>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [receiptLoadFailed, setReceiptLoadFailed] = useState<Set<string>>(new Set());
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const loadReceiptUrl = async (order: OrderRow) => {
    if (!order.receipt_url || receiptUrls[order.id]) return;
    try {
      const url = await getSignedUrl('payment-receipts', order.receipt_url);
      setReceiptUrls((prev) => ({ ...prev, [order.id]: url }));
    } catch {
      // Signed URL generation failed (e.g. file missing) — show a fallback
      // in the UI rather than a broken image.
      setReceiptLoadFailed((prev) => new Set(prev).add(order.id));
    }
  };

  const toggleExpand = (order: OrderRow) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      return next;
    });
    if (order.payment_method === 'BANK_TRANSFER') void loadReceiptUrl(order);
  };

  const handleVerifyPayment = async (orderId: string, outcome: 'paid' | 'failed') => {
    setVerifyingId(orderId);
    // Confirming payment also advances the order workflow to "confirmed" —
    // status stays independent of payment_status everywhere else in the
    // app, but this one action deliberately moves both together, since a
    // verified Bank Transfer order is, by definition, ready to be packed.
    // Rejecting only flips payment_status; the order workflow is untouched
    // so an admin can decide how to handle it (contact customer, cancel, etc).
    const updates =
      outcome === 'paid'
        ? { payment_status: 'paid', status: 'confirmed' }
        : { payment_status: 'failed' };

    const { error: updateError } = await supabase.from('orders').update(updates).eq('id', orderId);

    if (!updateError) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));
    }
    setVerifyingId(null);
  };

  const loadOrders = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setOrders((data ?? []) as OrderRow[]);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId: string, status: string) => {
    setUpdatingId(orderId);
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (!updateError) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    }
    setUpdatingId(null);
  };

  const filteredOrders =
    statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

  return (
    <>
      {loading && <p className="text-muted-foreground">Loading orders...</p>}
      {error && <p className="text-primary">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? 'border-primary bg-primary/20 text-primary'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {!loading && filteredOrders.length === 0 && (
        <p className="text-muted">No orders match this filter.</p>
      )}

      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const isExpanded = expandedIds.has(order.id);
          return (
            <div key={order.id} className="glass rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg text-foreground tracking-wide">
                    {order.order_reference}
                  </p>
                  <p className="text-xs text-muted">{formatDate(order.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-start gap-6">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted">Payment</span>
                    <div className="flex items-center gap-2">
                      <PaymentStatusBadge status={order.payment_status} />
                      {order.payment_method && (
                        <span className="text-xs text-muted-foreground">
                          {formatPaymentMethod(order.payment_method)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted">Status</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={order.status} />
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-background">
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium text-foreground">{order.full_name}</p>
                  <p className="text-muted">{order.phone}</p>
                </div>
                <p className="font-display text-lg text-primary">Rs. {order.total}</p>
              </div>

              <button
                type="button"
                onClick={() => toggleExpand(order)}
                className="mt-4 text-xs font-medium text-muted transition-colors hover:text-foreground"
              >
                {isExpanded ? 'Hide Details' : 'View Details'}
              </button>

              {isExpanded && (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                      <p className="mt-1 font-medium text-foreground">{order.full_name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-muted-foreground">{order.phone}</p>
                        <a
                          href={toWhatsAppLink(order.phone, order.full_name, order.order_reference)}
                          target="_blank"
                          rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-green-500"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Address</p>
                      <p className="mt-1 text-muted-foreground">
                        {order.address_line1}
                        {order.address_line2 ? `, ${order.address_line2}` : ''}
                      </p>
                      <p className="text-muted-foreground">
                        {order.city}, {order.district} {order.postal_code ?? ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted">Items</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {order.order_items.map((item) => (
                        <li key={item.id} className="flex justify-between">
                          <span>
                            {item.name}{' '}
                            <span className="text-muted">
                              · Size {item.size} · Qty {item.quantity}
                            </span>
                          </span>
                          <span className="text-muted">Rs. {item.price}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {order.payment_method === 'BANK_TRANSFER' && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                        Payment Receipt
                      </p>

                      {receiptUrls[order.id] ? (
                        <a
                          href={receiptUrls[order.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block"
                        >
                          <img
                            src={receiptUrls[order.id]}
                            alt="Payment receipt"
                            className="h-40 w-auto rounded-lg border border-border object-cover transition-opacity hover:opacity-80"
                          />
                        </a>
                      ) : receiptLoadFailed.has(order.id) ? (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <ImageOff className="h-4 w-4 flex-shrink-0" />
                          Couldn't load receipt preview
                        </p>
                      ) : order.receipt_url ? (
                        <p className="text-sm text-muted-foreground">Loading receipt...</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">No receipt uploaded</p>
                      )}

                      {order.payment_status === 'awaiting_verification' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={verifyingId === order.id}
                            onClick={() => handleVerifyPayment(order.id, 'paid')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/30 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Confirm Payment
                          </button>
                          <button
                            type="button"
                            disabled={verifyingId === order.id}
                            onClick={() => handleVerifyPayment(order.id, 'failed')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject Payment
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

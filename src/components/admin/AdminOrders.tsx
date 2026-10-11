import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  CheckCircle2,
  XCircle,
  ImageOff,
} from 'lucide-react';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { getSignedUrl } from '../../lib/storage';
import { formatDate } from '../../lib/admin';
import StatusBadge from './StatusBadge';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;
const PAYMENT_STATUSES = ['pending', 'awaiting_payment', 'awaiting_verification', 'paid', 'failed', 'refunded'] as const;
const PAGE_SIZE = 25;
const NEXT_STATUSES: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

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
  refunded: 'border-purple-500/40 bg-purple-500/20 text-purple-400',
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
  sku: string | null;
  is_preorder: boolean;
  preorder_days: number | null;
}

// Item-level pre-order snapshot is the source of truth for historical
// display — never re-derived from the live products table, since a
// product's pre-order status can change after the order was placed.
function preorderMessage(item: Pick<OrderItemRow, 'is_preorder' | 'preorder_days'>): string | null {
  if (!item.is_preorder) return null;
  const days = item.preorder_days;
  return days && days > 0 ? `Delivery within ${days} day${days === 1 ? '' : 's'}` : null;
}

interface OrderRow {
  id: string;
  order_reference: string;
  full_name: string;
  phone: string;
  mobile_phone: string | null;
  email: string | null;
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
  promo_code: string | null;
  discount_amount: number;
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  refund_reference: string | null;
  created_at: string;
  order_items: OrderItemRow[];
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof STATUSES)[number]>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | (typeof PAYMENT_STATUSES)[number]>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [receiptLoadFailed, setReceiptLoadFailed] = useState<Set<string>>(new Set());
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [shipmentDrafts, setShipmentDrafts] = useState<Record<string, { courierName: string; trackingNumber: string; trackingUrl: string }>>({});
  const [shipmentSavingId, setShipmentSavingId] = useState<string | null>(null);
  const [shipmentErrors, setShipmentErrors] = useState<Record<string, string>>({});
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  const [cancellingOrder, setCancellingOrder] = useState<OrderRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [refundReference, setRefundReference] = useState('');
  const [printOrder, setPrintOrder] = useState<OrderRow | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!printOrder) return;
    const timer = window.setTimeout(() => window.print(), 50);
    const finish = () => setPrintOrder(null);
    window.addEventListener('afterprint', finish, { once: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', finish); };
  }, [printOrder]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setSearch(searchInput.replace(/[\\,()"%_*]/g, ' ').trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const saveShipment = async (order: OrderRow) => {
    const draft = shipmentDrafts[order.id] ?? {
      courierName: order.courier_name ?? '',
      trackingNumber: order.tracking_number ?? '',
      trackingUrl: order.tracking_url ?? '',
    };
    let trackingUrl: string | null = draft.trackingUrl.trim() || null;
    if (trackingUrl) {
      try {
        const parsed = new URL(trackingUrl);
        if (parsed.protocol !== 'https:') throw new Error();
        trackingUrl = parsed.toString();
      } catch {
        setShipmentErrors((prev) => ({ ...prev, [order.id]: 'Enter a valid HTTPS tracking link.' }));
        return;
      }
    }

    setShipmentSavingId(order.id);
    setShipmentErrors((prev) => ({ ...prev, [order.id]: '' }));
    const updates = { courier_name: draft.courierName.trim() || null, tracking_number: draft.trackingNumber.trim() || null, tracking_url: trackingUrl };
    try {
      const { error: updateError } = await supabaseAdmin.rpc('admin_save_order_tracking', {
        p_order_id: order.id,
        p_courier_name: updates.courier_name,
        p_tracking_number: updates.tracking_number,
        p_tracking_url: updates.tracking_url,
      });
      if (updateError) throw updateError;
      setOrders((prev) => prev.map((item) => item.id === order.id ? { ...item, ...updates } : item));
      setShipmentDrafts((prev) => { const next = { ...prev }; delete next[order.id]; return next; });
      setShipmentErrors((prev) => ({ ...prev, [order.id]: '' }));
    } catch (e) {
      setShipmentErrors((prev) => ({ ...prev, [order.id]: e instanceof Error ? e.message : 'Could not save tracking details.' }));
    } finally {
      setShipmentSavingId(null);
    }
  };

  const loadReceiptUrl = async (order: OrderRow) => {
    if (!order.receipt_url || receiptUrls[order.id]) return;
    try {
      const url = await getSignedUrl('payment-receipts', order.receipt_url, 3600, supabaseAdmin);
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
    setOrderErrors((prev) => ({ ...prev, [orderId]: '' }));
    try {
      const { error: updateError } = await supabaseAdmin.rpc('admin_verify_order_payment', {
        p_order_id: orderId,
        p_outcome: outcome,
        p_note: null,
      });
      if (updateError) throw updateError;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? {
        ...o,
        payment_status: outcome,
        status: outcome === 'paid' ? 'confirmed' : o.status,
      } : o)));
    } catch (e) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: e instanceof Error ? e.message : 'Could not update payment status.' }));
    } finally {
      setVerifyingId(null);
    }
  };

  const loadOrders = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      let query = supabaseAdmin.from('orders').select('*, order_items(*)', { count: 'exact' }).order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (paymentFilter !== 'all') query = query.eq('payment_status', paymentFilter);
      if (dateFrom) query = query.gte('created_at', new Date(`${dateFrom}T00:00:00`).toISOString());
      if (dateTo) {
        const dateEnd = new Date(`${dateTo}T00:00:00`);
        dateEnd.setDate(dateEnd.getDate() + 1);
        query = query.lt('created_at', dateEnd.toISOString());
      }
      if (search) query = query.or(`order_reference.ilike.*${search}*,full_name.ilike.*${search}*,phone.ilike.*${search}*,email.ilike.*${search}*,tracking_number.ilike.*${search}*`);
      const { data, count, error: fetchError } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (fetchError) throw fetchError;
      if (request !== requestId.current) return;
      setOrders((data ?? []) as OrderRow[]);
      setTotalCount(count ?? 0);
    } catch (e) {
      if (request === requestId.current) setError(e instanceof Error ? e.message : 'Could not load orders.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [dateFrom, dateTo, page, paymentFilter, search, statusFilter]);

  useEffect(() => { void loadOrders(); }, [loadOrders, refreshKey]);

  const handleStatusChange = async (order: OrderRow, status: string, cancellation?: { reason: string; refundConfirmed: boolean; refundReference: string }) => {
    if (status === 'cancelled' && !cancellation) {
      setCancellingOrder(order);
      setCancelReason('');
      setRefundConfirmed(false);
      setRefundReference('');
      return;
    }
    setOrderErrors((prev) => ({ ...prev, [order.id]: '' }));
    setUpdatingId(order.id);
    try {
      const { error: updateError } = await supabaseAdmin.rpc('admin_transition_order', {
        p_order_id: order.id,
        p_next_status: status,
        p_note: cancellation?.reason ?? null,
        p_refund_confirmed: cancellation?.refundConfirmed ?? false,
        p_refund_reference: cancellation?.refundReference ?? null,
      });
      if (updateError) throw updateError;
      setOrders((prev) => prev.map((o) => (o.id === order.id ? {
        ...o,
        status,
        payment_status: cancellation?.refundConfirmed ? 'refunded' : status === 'delivered' && o.payment_method === 'COD' ? 'paid' : o.payment_status,
        refund_reference: cancellation?.refundReference || o.refund_reference,
      } : o)));
      setCancellingOrder(null);
    } catch (e) {
      setOrderErrors((prev) => ({ ...prev, [order.id]: e instanceof Error ? e.message : 'Could not update order status.' }));
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const submitCancellation = () => {
    if (cancellingOrder) void handleStatusChange(cancellingOrder, 'cancelled', {
      reason: cancelReason.trim(), refundConfirmed, refundReference: refundReference.trim(),
    });
  };

  if (printOrder) return (
    <main className="mx-auto max-w-xl bg-white p-8 text-black print:max-w-none">
      <div className="flex items-start justify-between border-b-2 border-black pb-4"><div><p className="text-xs font-bold uppercase tracking-widest">ComicCulture · Packing slip</p><h1 className="mt-2 text-2xl font-black">{printOrder.order_reference}</h1></div><p className="text-right text-sm">{formatDate(printOrder.created_at)}<br />{printOrder.status.toUpperCase()}</p></div>
      <section className="mt-6"><h2 className="text-xs font-bold uppercase tracking-widest">Ship to</h2><p className="mt-2 font-bold">{printOrder.full_name}</p><p>{printOrder.phone}{printOrder.mobile_phone ? ` · ${printOrder.mobile_phone}` : ''}</p>{printOrder.email && <p>{printOrder.email}</p>}<p className="mt-2">{printOrder.address_line1}{printOrder.address_line2 ? `, ${printOrder.address_line2}` : ''}<br />{printOrder.city}, {printOrder.district} {printOrder.postal_code ?? ''}</p></section>
      <table className="mt-6 w-full border-collapse text-sm"><thead><tr className="border-b border-black text-left"><th className="py-2">Item</th><th className="py-2">Size / SKU</th><th className="py-2 text-right">Qty</th></tr></thead><tbody>{printOrder.order_items.map((item) => <tr key={item.id} className="border-b border-gray-300"><td className="py-3">{item.name}{item.is_preorder ? ' · PREORDER' : ''}</td><td className="py-3">{item.size}{item.sku ? ` · ${item.sku}` : ''}</td><td className="py-3 text-right">{item.quantity}</td></tr>)}</tbody></table>
      <div className="mt-4 flex justify-between border-t-2 border-black pt-3 font-bold"><span>Order total · {formatPaymentMethod(printOrder.payment_method ?? '')}</span><span>Rs. {printOrder.total}</span></div>
      <p className="mt-10 border-t border-dashed border-black pt-3 text-center text-xs">Thank you for supporting ComicCulture.</p>
    </main>
  );

  return (
    <>
      {loading && <p className="text-muted-foreground">Loading orders...</p>}
      {error && <p role="alert" className="text-primary">{error}</p>}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <label className="text-xs text-muted-foreground md:col-span-2">Search orders
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Order, customer, phone, email, tracking" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Payment
          <select value={paymentFilter} onChange={(event) => { setPage(0); setPaymentFilter(event.target.value as typeof paymentFilter); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="all">All payments</option>{PAYMENT_STATUSES.map((item) => <option key={item} value={item}>{formatPaymentStatus(item)}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">From
          <input type="date" value={dateFrom} onChange={(event) => { setPage(0); setDateFrom(event.target.value); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">To
          <input type="date" value={dateTo} onChange={(event) => { setPage(0); setDateTo(event.target.value); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
      </div>
      <div className="admin-filter-row mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
        {(['all', ...STATUSES] as const).map((s) => (
          <button key={s} type="button" onClick={() => { setPage(0); setStatusFilter(s); }} className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${statusFilter === s ? 'border-primary bg-primary/20 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{s}</button>
        ))}
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="btn-outline ml-auto text-xs">Refresh</button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{totalCount} matching order{totalCount === 1 ? '' : 's'}</p>

      {!loading && orders.length === 0 && (
        <p className="text-muted">No orders match these filters.</p>
      )}

      <div className="space-y-4">
        {orders.map((order) => {
          const isExpanded = expandedIds.has(order.id);
          return (
            <div key={order.id} className="glass rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg text-foreground tracking-wide">
                      {order.order_reference}
                    </p>
                    {order.order_items.some((item) => item.is_preorder) && (
                      <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Pre-Order
                      </span>
                    )}
                  </div>
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
                        onChange={(e) => void handleStatusChange(order, e.target.value)}
                        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        {[order.status, ...(NEXT_STATUSES[order.status] ?? [])].map((s) => (
                          <option key={s} value={s} className="bg-background">
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              {orderErrors[order.id] && <p role="alert" className="mt-3 text-sm text-primary">{orderErrors[order.id]}</p>}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium text-foreground">{order.full_name}</p>
                  <p className="text-muted">{order.phone}</p>
                </div>
                <div className="text-right">
                  {order.discount_amount > 0 && (
                    <p className="text-xs text-green-400">{order.promo_code} · −Rs. {order.discount_amount}</p>
                  )}
                  <p className="font-display text-lg text-primary">Rs. {order.total}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleExpand(order)}
                className="mt-4 text-xs font-medium text-muted transition-colors hover:text-foreground"
              >
                {isExpanded ? 'Hide Details' : 'View Details'}
              </button>
              <button type="button" onClick={() => setPrintOrder(order)} className="ml-4 text-xs font-medium text-muted transition-colors hover:text-foreground">Print packing slip</button>

              {isExpanded && (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                      <p className="mt-1 font-medium text-foreground">{order.full_name}</p>
                      {order.email && (
                        <a
                          href={`mailto:${order.email}`}
                          className="mt-1 inline-block text-primary transition-colors hover:text-foreground"
                        >
                          {order.email}
                        </a>
                      )}
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
                      {order.mobile_phone && (
                        <p className="mt-1 text-muted-foreground">Mobile: {order.mobile_phone}</p>
                      )}
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
                        <li key={item.id} className="flex flex-col gap-0.5">
                          <div className="flex justify-between">
                            <span>
                              {item.name}{' '}
                              <span className="text-muted">
                                · Size {item.size} · Qty {item.quantity}
                              </span>
                            </span>
                            <span className="text-muted">Rs. {item.price}</span>
                          </div>
                          {item.sku && <span className="text-xs text-muted">SKU: {item.sku}</span>}
                          {item.is_preorder && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Pre-Order{preorderMessage(item) ? ` — ${preorderMessage(item)}` : ''}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {order.refund_reference && <p className="mt-3 text-xs text-muted-foreground">Refund reference: {order.refund_reference}</p>}

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-3 text-xs uppercase tracking-wide text-muted">Courier tracking</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {([
                        ['courierName', 'Courier / delivery service', order.courier_name ?? ''],
                        ['trackingNumber', 'Tracking number', order.tracking_number ?? ''],
                        ['trackingUrl', 'Tracking link (HTTPS)', order.tracking_url ?? ''],
                      ] as const).map(([field, label, savedValue]) => (
                        <label key={field} className="text-xs text-muted-foreground">
                          {label}
                          <input
                            type={field === 'trackingUrl' ? 'url' : 'text'}
                            value={shipmentDrafts[order.id]?.[field] ?? savedValue}
                            onChange={(event) => setShipmentDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                courierName: prev[order.id]?.courierName ?? order.courier_name ?? '',
                                trackingNumber: prev[order.id]?.trackingNumber ?? order.tracking_number ?? '',
                                trackingUrl: prev[order.id]?.trackingUrl ?? order.tracking_url ?? '',
                                [field]: event.target.value,
                              },
                            }))}
                            placeholder={field === 'trackingUrl' ? 'https://courier.example/track/…' : ''}
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        disabled={shipmentSavingId === order.id}
                        onClick={() => void saveShipment(order)}
                        className="btn-outline text-xs"
                      >
                        {shipmentSavingId === order.id ? 'Saving…' : 'Save tracking details'}
                      </button>
                      {shipmentErrors[order.id] && <p role="alert" className="text-xs text-primary">{shipmentErrors[order.id]}</p>}
                    </div>
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
      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn-outline text-xs disabled:opacity-50">Previous</button>
        <span className="text-xs text-muted-foreground">Page {Math.min(page + 1, totalPages)} of {totalPages}</span>
        <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="btn-outline text-xs disabled:opacity-50">Next</button>
      </div>
      {cancellingOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" className="glass w-full max-w-lg space-y-4 rounded-2xl p-6">
            <h2 id="cancel-order-title" className="font-display text-xl text-foreground">Cancel {cancellingOrder.order_reference}?</h2>
            <p className="text-sm text-muted-foreground">This restores the reserved inventory. Record the reason for the audit history.</p>
            <label className="block text-xs text-muted-foreground">Cancellation reason<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required minLength={3} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground" /></label>
            {cancellingOrder.payment_status === 'paid' && <>
              <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={refundConfirmed} onChange={(event) => setRefundConfirmed(event.target.checked)} />I have completed the customer refund</label>
              <label className="block text-xs text-muted-foreground">Refund reference<input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>
            </>}
            {orderErrors[cancellingOrder.id] && <p role="alert" className="text-sm text-primary">{orderErrors[cancellingOrder.id]}</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setCancellingOrder(null)} className="btn-outline text-sm">Keep order</button><button type="button" disabled={updatingId === cancellingOrder.id || cancelReason.trim().length < 3 || (cancellingOrder.payment_status === 'paid' && (!refundConfirmed || !refundReference.trim()))} onClick={submitCancellation} className="btn-primary text-sm disabled:opacity-50">{updatingId === cancellingOrder.id ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
          </section>
        </div>
      )}
    </>
  );
}

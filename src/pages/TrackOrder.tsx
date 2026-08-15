import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, PackageSearch, CheckCircle2, Package, Truck, Home as HomeIcon, XCircle } from 'lucide-react';
import { trackOrder } from '../data/tracking';
import type { TrackedOrder, TrackedOrderItem } from '../data/tracking';

type ContactMethod = 'email' | 'phone';

const STEPS = [
  { key: 'pending', label: 'Received', icon: PackageSearch },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'packed', label: 'Packed', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: HomeIcon },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Item-level pre-order snapshot is the source of truth here — never
// re-derived from the current products table, since a product's pre-order
// setting can change after the order was placed. Guards against null/0
// so we never render "Delivery within null days".
function preorderMessage(item: Pick<TrackedOrderItem, 'is_preorder' | 'preorder_days'>): string | null {
  if (!item.is_preorder) return null;
  const days = item.preorder_days;
  return days && days > 0 ? `Delivery within ${days} day${days === 1 ? '' : 's'}` : 'Pre-Order';
}

/**
 * Order-level pre-order summary. Only meaningful when at least one item is
 * a pre-order (checked by the caller). States a shared timeframe when every
 * pre-order item has the same valid preorder_days; otherwise falls back to
 * generic wording rather than combining differing timeframes.
 */
function preorderSummary(items: TrackedOrderItem[]): string {
  const days = items.filter((i) => i.is_preorder).map((i) => i.preorder_days);
  const uniqueDays = new Set(days);
  if (uniqueDays.size === 1) {
    const d = days[0];
    if (d && d > 0) return `Delivery within ${d} day${d === 1 ? '' : 's'}`;
  }
  return 'Delivery times are shown per item below.';
}

export default function TrackOrder() {
  const [orderReference, setOrderReference] = useState('');
  const [contactMethod, setContactMethod] = useState<ContactMethod>('email');
  const [contactValue, setContactValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedOrder | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orderReference.trim() || !contactValue.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const order = await trackOrder({
        orderReference,
        email: contactMethod === 'email' ? contactValue : undefined,
        phone: contactMethod === 'phone' ? contactValue : undefined,
      });

      if (!order) {
        setError(
          "We couldn't find an order matching those details. Double-check your order reference and contact info."
        );
      } else {
        setResult(order);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const currentStepIndex = result ? STEPS.findIndex((s) => s.key === result.status) : -1;
  const isCancelled = result?.status === 'cancelled';
  const hasPreorderItem = result ? result.items.some((item) => item.is_preorder) : false;

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-24">
      <div className="absolute inset-0 bg-web-pattern opacity-20" />
      <div className="absolute inset-0 halftone-overlay opacity-30" />

      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="font-display text-3xl text-foreground tracking-wide md:text-4xl">
            TRACK YOUR <span className="text-gradient-red">ORDER</span>
          </h1>
          <p className="mt-3 text-muted">
            Enter your order reference and the email or phone number used at checkout.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-10 rounded-lg border border-border bg-surface p-6 shadow-soft md:p-8"
        >
          <label className="block text-xs uppercase tracking-wide text-muted">Order Reference</label>
          <input
            type="text"
            value={orderReference}
            onChange={(e) => setOrderReference(e.target.value)}
            placeholder="e.g. CC-10234"
            className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            required
          />

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setContactMethod('email')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                contactMethod === 'email'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-surface-hover'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setContactMethod('phone')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                contactMethod === 'phone'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-surface-hover'
              }`}
            >
              Phone
            </button>
          </div>

          <label className="mt-4 block text-xs uppercase tracking-wide text-muted">
            {contactMethod === 'email' ? 'Email Address' : 'Phone Number'}
          </label>
          <input
            type={contactMethod === 'email' ? 'email' : 'tel'}
            value={contactValue}
            onChange={(e) => setContactValue(e.target.value)}
            placeholder={contactMethod === 'email' ? 'you@example.com' : '07XXXXXXXX'}
            className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            required
          />

          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
            <Search className="h-4 w-4" />
            {loading ? 'Searching…' : 'Track Order'}
          </button>
        </form>

        <AnimatePresence mode="wait">
          {error && !result && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-lg border border-danger/30 bg-danger/10 px-6 py-4 text-sm text-danger"
            >
              {error}
            </motion.div>
          )}

          {result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-soft md:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Order Reference</p>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg text-foreground tracking-wide">
                      {result.order_reference}
                    </p>
                    {hasPreorderItem && (
                      <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Pre-Order
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted">Placed On</p>
                  <p className="text-sm text-foreground">{formatDate(result.created_at)}</p>
                </div>
              </div>

              {hasPreorderItem && (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Pre-Order Notice</p>
                  <p className="mt-1 text-muted-foreground">
                    Your order contains a pre-order item. {preorderSummary(result.items)}
                  </p>
                </div>
              )}

              {isCancelled ? (
                <div className="mt-6 flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  <XCircle className="h-5 w-5 shrink-0" />
                  This order was cancelled. Contact us on WhatsApp if you have questions.
                </div>
              ) : (
                <div className="mt-8 flex items-center">
                  {STEPS.map((step, i) => {
                    const Icon = step.icon;
                    const isComplete = i <= currentStepIndex;
                    return (
                      <div key={step.key} className="flex flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                              isComplete
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-border bg-background text-muted-foreground'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          {i < STEPS.length - 1 && (
                            <div
                              className={`h-0.5 flex-1 ${
                                i < currentStepIndex ? 'bg-primary' : 'bg-border'
                              }`}
                            />
                          )}
                        </div>
                        <p
                          className={`mt-2 text-[11px] uppercase tracking-wide ${
                            isComplete ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {step.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 space-y-3 border-t border-border pt-6">
                {result.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Size {item.size} · Qty {item.quantity}
                      </p>
                      {preorderMessage(item) && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Pre-Order — {preorderMessage(item)}
                        </span>
                      )}
                    </div>
                    <p className="text-foreground">Rs. {item.price * item.quantity}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <p className="text-sm text-muted">Total</p>
                <p className="font-display text-lg text-foreground">Rs. {result.total}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

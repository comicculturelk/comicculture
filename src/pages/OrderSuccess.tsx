import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { formatPrice } from '../data/products';

interface OrderSuccessState {
  orderReference?: string;
  customerName?: string;
  totalItems?: number;
  total?: number;
}

export default function OrderSuccess() {
  const location = useLocation();
  const state = (location.state ?? {}) as OrderSuccessState;
  // Navigation state (set by Checkout right after a successful order) is
  // gone on refresh or a direct/shared link — fall back to a message that
  // doesn't claim to know details we no longer have, instead of silently
  // showing a half-empty page.
  const hasOrderDetails = Boolean(state.orderReference);

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      <div className="absolute inset-0 bg-web-pattern opacity-20" />
      <div className="absolute inset-0 halftone-overlay opacity-30" />

      <motion.div
        className="relative z-10 flex max-w-lg flex-col items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15, type: 'spring' }}
        >
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </motion.div>

        <h1 className="mt-6 font-display text-3xl text-foreground tracking-wide md:text-4xl">
          ORDER <span className="text-gradient-red">RECEIVED</span>
        </h1>

        {hasOrderDetails ? (
          <p className="mt-4 text-muted">
            {state.customerName ? `Thanks, ${state.customerName}! ` : 'Thank you! '}
            Your order has been received. We'll reach out shortly on WhatsApp or phone to confirm
            delivery details.
          </p>
        ) : (
          <p className="mt-4 text-muted">
            We can't show your order confirmation details on this page right now — this can
            happen after a refresh or when opening this page directly. If you just placed an
            order, it's still been received. Use Track Order below with your order reference and
            the email or phone number you checked out with to see its status.
          </p>
        )}

        {hasOrderDetails && (
          <div className="mt-6 rounded-lg border border-border bg-surface px-6 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">Order Reference</p>
            <p className="font-display text-lg text-foreground tracking-wide">
              {state.orderReference}
            </p>
            {typeof state.total === 'number' && (
              <p className="mt-1 text-sm text-muted-foreground">
                {state.totalItems} {state.totalItems === 1 ? 'item' : 'items'} ·{' '}
                {formatPrice(state.total)}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/track-order" className="btn-primary">
            Track Your Order
          </Link>
          <Link to="/shop" className="btn-outline">
            Continue Shopping
          </Link>
          <Link to="/" className="btn-outline">
            Back to Home
          </Link>
        </div>
        {hasOrderDetails && (
          <p className="mt-3 text-xs text-muted-foreground">
            Use your order reference and email/phone to check your delivery status anytime.
          </p>
        )}
      </motion.div>
    </section>
  );
}

import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

interface OrderSuccessState {
  orderReference?: string;
  customerName?: string;
  totalItems?: number;
  total?: number;
}

export default function OrderSuccess() {
  const location = useLocation();
  const state = (location.state ?? {}) as OrderSuccessState;

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

        <h1 className="mt-6 font-display text-3xl text-white tracking-wide md:text-4xl">
          ORDER <span className="text-gradient-red">RECEIVED</span>
        </h1>

        <p className="mt-4 text-white/60">
          {state.customerName ? `Thanks, ${state.customerName}! ` : 'Thank you! '}
          Your order has been received. We'll reach out shortly on WhatsApp or phone to confirm
          delivery details.
        </p>

        {state.orderReference && (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/5 px-6 py-3">
            <p className="text-xs uppercase tracking-wide text-white/40">Order Reference</p>
            <p className="font-display text-lg text-white tracking-wide">
              {state.orderReference}
            </p>
            {typeof state.total === 'number' && (
              <p className="mt-1 text-sm text-white/50">
                {state.totalItems} {state.totalItems === 1 ? 'item' : 'items'} · Rs. {state.total}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/shop" className="btn-primary">
            Continue Shopping
          </Link>
          <Link to="/" className="btn-outline">
            Back to Home
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

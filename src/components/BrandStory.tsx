import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PackageCheck, RefreshCw, Wallet } from 'lucide-react';

export default function BrandStory() {
  return (
    <section className="relative bg-surface py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 max-w-2xl">
          <motion.h2
          className="font-display text-3xl leading-tight tracking-tight text-foreground md:text-4xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          Made for everyday fandom
          </motion.h2>

          <motion.p
          className="mt-3 max-w-xl text-base text-muted"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          Thoughtful designs, comfortable fits, and clear delivery details from checkout to your door.
          </motion.p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Benefit icon={<PackageCheck className="h-5 w-5" />} title="Island-wide delivery" text="Delivery fees and timing are shown before you place an order." />
          <Benefit icon={<Wallet className="h-5 w-5" />} title="Flexible payment" text="Choose cash on delivery or bank transfer at checkout." />
          <Benefit icon={<RefreshCw className="h-5 w-5" />} title="Exchange support" text="Read the exchange policy before choosing your size." />
        </div>
      </div>
    </section>
  );
}

function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">{icon}</span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

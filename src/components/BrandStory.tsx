import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

const values = [
  {
    label: 'No Reprints',
    detail: "Once a print run ends, it's retired for good. Scarcity isn't a marketing tactic here — it's the model.",
  },
  {
    label: 'Source Over Trend',
    detail: "Every graphic is pulled from real continuity, not whatever's trending this week.",
  },
  {
    label: 'Built To Move',
    detail: 'Jersey-grade fabric chosen for how it wears in over time, not just how it photographs.',
  },
];

export default function BrandStory() {
  return (
    <section className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 halftone-overlay opacity-20" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.div
          className="inline-flex items-center gap-2 border border-foreground/10 bg-surface px-4 py-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
            The ComicCulture Manifesto
          </span>
        </motion.div>

        <motion.h2
          className="mt-8 font-display text-4xl md:text-5xl lg:text-6xl leading-tight tracking-wide text-foreground"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          BUILT LIKE A <span className="text-gradient-red">FIRST ISSUE</span>.
          <br />
          WORN LIKE A <span className="text-gradient-blue">SECOND SKIN</span>.
        </motion.h2>

        <motion.p
          className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted leading-relaxed"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          ComicCulture exists for people who never grew out of their favorite universe — they
          just started dressing like they belong in it. We treat every release the way a
          publisher treats a first print: considered, numbered, and never reissued the same
          way twice. This isn't fan merchandise. It's canon you can wear.
        </motion.p>

        <motion.div
          className="mt-14 grid grid-cols-1 gap-8 border-t border-foreground/10 pt-10 text-left sm:grid-cols-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          {values.map((value) => (
            <div key={value.label}>
              <p className="font-display text-lg tracking-wide text-foreground">{value.label}</p>
              <p className="mt-2 text-sm text-muted leading-relaxed">{value.detail}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

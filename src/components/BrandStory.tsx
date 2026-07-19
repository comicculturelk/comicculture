import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

const values = [
  {
    label: 'Premium Material',
    detail: 'Jersey-grade fabric built to move and last, not just look good in a photo.',
  },
  {
    label: 'Limited Runs',
    detail: "Every issue is printed in limited numbers. Once it's gone, it's gone.",
  },
  {
    label: 'True To Source',
    detail: 'Every design is rooted in real lore, not a random graphic thrown on cotton.',
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
          className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-surface px-4 py-2"
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
          EVERY DESIGN IS A <span className="text-gradient-red">CHAPTER</span>.
          <br />
          EVERY SHIRT HAS A <span className="text-gradient-blue">STORY</span>.
        </motion.h2>

        <motion.p
          className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted leading-relaxed"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          We don't print graphics on shirts — we print chapters. Every ComicCulture piece is
          drawn from a world you already know, cut from jersey-grade fabric, and released in
          numbers small enough to stay rare. This isn't fandom merch. It's wearable canon.
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

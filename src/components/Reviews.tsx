import { motion } from 'framer-motion';
import { BadgeCheck, Instagram } from 'lucide-react';

const letters = [
  {
    name: 'Kasun Perera',
    location: 'Colombo, Sri Lanka',
    text: 'The Classic Red jersey is absolutely stunning. The quality exceeded my expectations. Premium fabric and perfect fit!',
    product: 'The Classic Red',
  },
  {
    name: 'Sarah Williams',
    location: 'London, UK',
    text: 'Love the attention to detail on my Symbiotic Suit. The matte black finish is gorgeous. Ordering via WhatsApp was seamless!',
    product: 'The Symbiotic Suit',
  },
  {
    name: 'David Chen',
    location: 'Singapore',
    text: "Finally a brand that understands the culture! The Volt Spider design turns heads everywhere I go. Will buy again.",
    product: 'The Volt Spider',
  },
  {
    name: 'Amala Fernando',
    location: 'Kandy, Sri Lanka',
    text: 'The Gwen design is beautiful! Love how unique it is. Fast shipping and great customer service on Instagram.',
    product: 'The Classic Gwen',
  },
];

export default function Reviews() {
  return (
    <section id="community" className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            COLLECTOR NOTES
          </span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            THE READER <span className="text-gradient-red">ARCHIVE</span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Letters, notes, and sightings from collectors currently living in the universe.
          </p>
        </motion.div>

        {/* Letters grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {letters.map((letter, index) => (
            <motion.div
              key={letter.name}
              className="border border-border bg-surface p-6 sm:p-8"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="font-display text-xs tracking-[0.25em] text-muted uppercase">
                  Letter №{String(index + 1).padStart(3, '0')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Verified Collector
                </span>
              </div>

              {/* Quote */}
              <p className="mt-5 text-lg text-foreground/80 leading-relaxed italic">
                "{letter.text}"
              </p>

              {/* Dashed divider — clipped-page feel */}
              <div className="mt-6 border-t border-dashed border-border pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-primary/30 bg-primary/5 font-display text-lg text-primary">
                      {letter.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-display text-base tracking-wide text-foreground">
                        {letter.name}
                      </p>
                      <p className="text-xs text-muted">{letter.location}</p>
                    </div>
                  </div>
                  <span className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Wearing
                    <br />
                    <span className="text-primary">{letter.product}</span>
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Community follow line */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <a
            href="https://instagram.com/comicculture.lk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <Instagram className="h-4 w-4" />
            Join the conversation @ComicCulture.lk
          </a>
        </motion.div>
      </div>
    </section>
  );
}

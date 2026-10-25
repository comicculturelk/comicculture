import { STORE_CONFIG } from '../config/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Minus, Search, MessageCircle, PackageSearch } from 'lucide-react';

const faqs = [
  {
    question: 'What products do you sell?',
    answer: 'ComicCulture offers premium fan-apparel T-shirts — including jersey, cotton, and cotton/polyester styles — inspired by comics, anime, and pop culture. Availability depends on current stock, so some designs may sell out from time to time.',
  },
  {
    question: 'How do I place an order?',
    answer: 'Add your size to the cart and head to checkout. You can pay with Cash on Delivery or Bank Transfer — no WhatsApp or Instagram messages needed.',
  },
  {
    question: 'Where do you deliver?',
    answer: 'We currently deliver islandwide within Sri Lanka only, through our courier partner Koombiyo.',
  },
  {
    question: 'What payment methods are available?',
    answer: 'We accept Cash on Delivery (COD) and Bank Transfer. For Bank Transfer, you\'ll upload your payment receipt at checkout for verification.',
  },
  {
    question: 'How long does delivery take?',
    answer: STORE_CONFIG.deliveryTiming,
  },
  {
    question: 'Can I change my order after placing it?',
    answer: 'Reach out to us as soon as possible with any changes to size, address, or items. We can usually update your order before it\'s packed and handed over to Koombiyo, but not after.',
  },
  {
    question: 'What sizes are available?',
    answer: 'Our T-shirts come in XS, S, M, L, XL, and XXL. Check the size guide on each product page before ordering, as fit can vary between prints.',
  },
  {
    question: 'Can I exchange sizes?',
    answer: 'Yes, size exchanges are available under our Return & Exchange Policy. Check that page for eligibility and how to start an exchange.',
  },
  {
    question: 'What if I receive a damaged or wrong item?',
    answer: 'Contact us right away with photos of the item and packaging. Damaged or incorrect items are covered under our Return & Exchange Policy.',
  },
  {
    question: 'How do I track my order?',
    answer: 'Use the Track Order page with your order reference and the email or phone number you checked out with to see the latest status.',
  },
  {
    question: 'Are products limited edition?',
    answer: 'No, our designs aren\'t limited edition. Stock is finite, so a size or design may sell out from time to time, but you can check the product page for current availability.',
  },
  {
    question: 'Are these officially licensed products?',
    answer: 'ComicCulture is a fan-inspired apparel brand. Our designs are original artwork inspired by comic books, pop culture, and fictional universes. We are not affiliated with, endorsed by, or officially connected to any comic book publishers or entertainment companies',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const [search, setSearch] = useState('');

  const visibleFaqs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return faqs.map((faq, index) => ({ faq, index })).filter(({ faq }) =>
      !query || `${faq.question} ${faq.answer}`.toLowerCase().includes(query)
    );
  }, [search]);

  const toggle = (index: number) => {
    setOpen(open === index ? null : index);
  };

  return (
    <section className="comic-page relative py-24 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-white/[0.02] to-background">
        <div className="absolute inset-0 halftone-overlay opacity-20" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            Frequently asked <span className="text-gradient-red">questions</span>
          </h1>
        </motion.div>

        {/* FAQ items */}
        <label className="relative mb-6 block">
          <span className="sr-only">Search frequently asked questions</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search delivery, sizing, returns..."
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 pl-11 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>

        <div className="space-y-3">
          {visibleFaqs.map(({ faq, index }) => (
            <motion.div
              key={faq.question}
              className="glass rounded-xl overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
            >
              <button
                type="button"
                onClick={() => toggle(index)}
                aria-expanded={open === index}
                aria-controls={`faq-answer-${index}`}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="text-sm font-semibold leading-relaxed text-foreground pr-4">
                  {faq.question}
                </span>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {open === index ? (
                    <Minus className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <Plus className="h-5 w-5 text-muted flex-shrink-0" />
                  )}
                </motion.div>
              </button>

              <AnimatePresence>
                {open === index && (
                  <motion.div
                    id={`faq-answer-${index}`}
                    role="region"
                    aria-label={faq.question}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
          {visibleFaqs.length === 0 && (
            <p role="status" className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              No answers matched that search. Try a different term or contact us.
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link to="/track-order" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
            <span className="inline-flex items-center gap-3"><PackageSearch aria-hidden="true" className="h-5 w-5 text-primary" />Track an existing order</span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link to="/contact" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
            <span className="inline-flex items-center gap-3"><MessageCircle aria-hidden="true" className="h-5 w-5 text-primary" />Still need help?</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

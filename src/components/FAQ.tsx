import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const faqs = [
  {
    question: 'How do I place an order?',
    answer: 'Simply click on any jersey, select your size, and click the "Order on WhatsApp" or "DM on Instagram" button. Our team will guide you through the rest!',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept bank transfers, credit cards, and mobile payments. Details will be shared via WhatsApp after you place your order.',
  },
  {
    question: 'How long does shipping take?',
    answer: 'Orders within Sri Lanka arrive in 3-5 business days. International shipping takes 7-14 business days depending on your location.',
  },
  {
    question: 'What sizes are available?',
    answer: 'All jerseys are available in S, M, L, XL, and XXL. Check the size chart on each product page for specific measurements.',
  },
  {
    question: 'Can I return or exchange a jersey?',
    answer: 'Yes! We accept returns within 7 days of delivery if the jersey is unworn with tags attached. Contact us via WhatsApp to initiate a return.',
  },
  {
    question: 'Are these officially licensed products?',
    answer: 'ComicCulture is a fan-inspired brand. Our jerseys are original designs inspired by Spider-Man variants. Not affiliated with Marvel or Sony.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpen(open === index ? null : index);
  };

  return (
    <section className="relative py-24 lg:py-32">
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
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white tracking-wide">
            GOT <span className="text-gradient-red">QUESTIONS</span>
          </h2>
        </motion.div>

        {/* FAQ items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              className="glass rounded-xl overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
            >
              <button
                onClick={() => toggle(index)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-display text-lg text-white tracking-wide pr-8">
                  {faq.question}
                </span>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {open === index ? (
                    <Minus className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <Plus className="h-5 w-5 text-white/60 flex-shrink-0" />
                  )}
                </motion.div>
              </button>

              <AnimatePresence>
                {open === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-5 pb-5 text-white/70 leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

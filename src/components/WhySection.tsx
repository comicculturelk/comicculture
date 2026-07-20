import { motion } from 'framer-motion';
import { Star, Sparkles, Clock } from 'lucide-react';

const features = [
  {
    icon: Star,
    title: 'Premium Jersey Material',
    description: 'High-quality breathable fabric designed for comfort and durability. Perfect for sports or streetwear.',
    color: 'from-primary to-primary-hover',
  },
  {
    icon: Sparkles,
    title: 'Unique Spider-Verse Designs',
    description: 'Each jersey is inspired by iconic Spider-Man variants across the multiverse. Stand out from the crowd.',
    color: 'from-secondary to-secondary-glow',
  },
  {
    icon: Clock,
    title: 'Limited Drops',
    description: 'Every collection is released in limited quantities. Once they\'re gone, they\'re gone forever.',
    color: 'from-purple-500 to-pink-500',
  },
];

export default function WhySection() {
  return (
    <section id="about" className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-white/[0.02] to-background">
        <div className="absolute inset-0 halftone-overlay opacity-30" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            WHY <span className="text-gradient-red">COMICCULTURE</span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            We don't just make jerseys. We create wearable art inspired by the stories you love.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="group relative"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15, duration: 0.6 }}
            >
              <div className="relative glass rounded-2xl p-8 text-center transition-all duration-300 group-hover:border-primary/30">
                {/* Glow on hover */}
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-20" style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-from), var(--tw-gradient-to))` }} />

                {/* Icon */}
                <motion.div
                  className={`relative mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color}`}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                    <feature.icon className="h-8 w-8 text-primary-foreground" />
                </h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

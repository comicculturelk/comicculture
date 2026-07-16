import { motion } from 'framer-motion';
import { Pencil, Lightbulb, Palette, Printer, CheckCircle, Truck } from 'lucide-react';

const steps = [
  { icon: Pencil, label: 'Sketch', description: 'Initial concept art' },
  { icon: Lightbulb, label: 'Concept', description: 'Design refinement' },
  { icon: Palette, label: 'Design', description: 'Final artwork creation' },
  { icon: Printer, label: 'Printing', description: 'Premium fabric印刷' },
  { icon: CheckCircle, label: 'Quality Check', description: 'Perfection guaranteed' },
  { icon: Truck, label: 'Delivery', description: 'Shipped to your door' },
];

export default function Timeline() {
  return (
    <section className="relative py-24 lg:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />
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
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white tracking-wide">
            BEHIND THE <span className="text-gradient-blue">DESIGN</span>
          </h2>
          <p className="mt-4 text-lg text-white/60 max-w-2xl mx-auto">
            Every jersey goes through our meticulous 6-step process before reaching you.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-primary via-secondary to-primary opacity-30 hidden md:block" />

          <div className="grid grid-cols-2 md:grid-cols-6 gap-6 md:gap-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.label}
                className="relative flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                {/* Step circle */}
                <motion.div
                  className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-background border-2 border-primary/50"
                  whileHover={{ scale: 1.1, borderColor: 'rgb(225, 29, 72)' }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <step.icon className="h-7 w-7 text-primary" />
                </motion.div>

                {/* Label */}
                <p className="mt-4 font-display text-lg text-white tracking-wide">
                  {step.label}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  {step.description}
                </p>

                {/* Step number */}
                <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {index + 1}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

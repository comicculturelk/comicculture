import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-bg px-6 text-center">
      {/* Background */}
      <div className="absolute inset-0 bg-web-pattern opacity-20" />
      <div className="absolute inset-0 halftone-overlay opacity-30" />

      <div className="relative z-10">
        <p className="font-display text-8xl text-brand-red md:text-9xl">404</p>
        <h1 className="mt-4 font-display text-3xl text-white tracking-wide md:text-4xl">
          LOST IN THE <span className="text-gradient-red">SPIDER-VERSE</span>
        </h1>
        <p className="mt-4 text-white/60">
          This page doesn't exist in this universe. Let's get you back home.
        </p>
        <Link to="/" className="btn-primary mt-8 inline-flex">
          Back to Home
        </Link>
      </div>
    </section>
  );
}

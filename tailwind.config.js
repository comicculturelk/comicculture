/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-hover': 'var(--color-surface-hover)',
        foreground: 'var(--color-foreground)',
        muted: 'var(--color-muted)',
        'muted-foreground': 'var(--color-muted-foreground)',
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        secondary: 'var(--color-secondary)',
        'secondary-glow': 'var(--color-secondary-glow)',
        border: 'var(--color-border)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        display: ['Bebas Neue', 'Impact', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'primary-glow': '0 0 30px rgba(var(--color-primary-rgb), 0.4)',
        'secondary-glow': '0 0 30px rgba(var(--color-secondary-rgb), 0.4)',
        soft: '0 20px 50px rgba(0, 0, 0, 0.35)',
      },
      backgroundImage: {
        halftone: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23ffffff' fill-opacity='0.03'/%3E%3C/svg%3E")`,
        'web-pattern': `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 0 L50 100 M0 50 L100 50 M0 0 L100 100 M100 0 L0 100' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
      },
    },
  },
  plugins: [],
};

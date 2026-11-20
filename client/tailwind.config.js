/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: 'var(--dd-primary)',
          50: '#e8eef5',
          100: '#c5d4e6',
          600: 'var(--dd-primary-hover)',
          700: '#152f4f',
          800: 'var(--dd-primary)',
          900: '#0a1a2e',
        },
        accent: { DEFAULT: 'var(--dd-accent)', soft: 'var(--dd-accent-soft)' },
        surface: 'var(--dd-surface)',
        canvas: 'var(--dd-bg)',
        success: { DEFAULT: 'var(--dd-success)', soft: 'var(--dd-success-soft)' },
        warning: { DEFAULT: 'var(--dd-warning)', soft: 'var(--dd-warning-soft)' },
        danger: { DEFAULT: 'var(--dd-error)', soft: 'var(--dd-error-soft)' },
        muted: 'var(--dd-text-muted)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 39, 68, 0.08), 0 1px 2px rgba(15, 39, 68, 0.06)',
      },
    },
  },
  plugins: [],
};
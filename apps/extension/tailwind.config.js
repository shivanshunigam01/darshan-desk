/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./popup.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        temple: {
          red: '#B80012',
          black: '#101010',
          surface: '#181818',
          muted: '#F5F5F5',
        },
      },
      width: {
        popup: '400px',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.28s ease-out',
        spin: 'spin 0.75s linear infinite',
      },
    },
  },
  plugins: [],
};
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f1f0ff', 100: '#e5e3ff', 200: '#cfccff', 300: '#b0a9ff', 400: '#8f82fb',
          500: '#7459f5', 600: '#6339e8', 700: '#5429cc', 800: '#4524a6', 900: '#392083',
        },
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
        dot: { '0%,80%,100%': { transform: 'scale(.6)', opacity: 0.4 }, '40%': { transform: 'scale(1)', opacity: 1 } },
        ring: { '0%': { transform: 'scale(1)', opacity: 0.55 }, '100%': { transform: 'scale(1.7)', opacity: 0 } },
        wave: { '0%,100%': { transform: 'scaleY(.35)' }, '50%': { transform: 'scaleY(1)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      animation: {
        'fade-in': 'fade-in .4s ease-out both',
        'slide-up': 'slide-up .45s cubic-bezier(.2,.8,.2,1) both',
        blink: 'blink 1s steps(1) infinite',
        dot: 'dot 1.2s infinite ease-in-out both',
        ring: 'ring 1.8s ease-out infinite',
        wave: 'wave .9s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

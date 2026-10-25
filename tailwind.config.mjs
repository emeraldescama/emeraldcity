import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
          950: '#022c22',
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        dragon: {
          dark: '#030712',
          card: '#0b1319',
          border: '#142a22',
          glow: '#059669',
        },
      },
      boxShadow: {
        'emerald-glow': '0 0 25px -5px rgba(16, 185, 129, 0.25)',
        'emerald-glow-lg': '0 0 40px -10px rgba(16, 185, 129, 0.4)',
        'amber-glow': '0 0 25px -5px rgba(251, 191, 36, 0.3)',
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [
    typography,
  ],
};

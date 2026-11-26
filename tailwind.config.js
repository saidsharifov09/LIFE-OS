/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Цвета темы задаются CSS-переменными в src/index.css
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: { sky: '#38bdf8', teal: '#2dd4bf', emerald: '#34d399', violet: '#a78bfa' },
        danger: '#f87171',
        warn: '#fbbf24',
      },
      borderRadius: { '4xl': '2rem' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

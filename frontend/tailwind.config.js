/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2fbf7',
          100: '#d3f4e3',
          500: '#10895b',
          600: '#0b6e48',
          700: '#09583b',
          800: '#084630',
          900: '#063927',
        },
        turmeric: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#d97706',
          600: '#b45309',
        },
      },
    },
  },
  plugins: [],
};

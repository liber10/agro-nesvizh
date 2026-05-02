/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        burgundy: '#631b1b',
        gold: '#d4af37',
        paper: '#f4eadd',
        ivory: '#fffcf8',
        ink: '#2a2222'
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        old: '0 24px 70px rgba(42,34,34,.18)'
      }
    }
  },
  plugins: []
};

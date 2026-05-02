import type { Config } from 'tailwindcss'

export default {
  content: [
    './popup/**/*.{html,tsx,ts}',
    './options/**/*.{html,tsx,ts}',
  ],
  darkMode: 'media',
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config

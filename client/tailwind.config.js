/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          navy: '#0f172a',
          navyLight: '#1e293b',
          blue: '#1e40af',
          blueHover: '#1d4ed8',
          grayBg: '#f8fafc',
          border: '#e2e8f0',
          textMuted: '#64748b',
          textDark: '#0f172a',
        },
      },
    },
  },
  plugins: [],
}

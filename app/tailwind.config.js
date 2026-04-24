/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hormuz: {
          gold: "#C9A84C",
          deep: "#0A0E1A",
          navy: "#0F1629",
          teal: "#00B4CC",
          red: "#CC2936",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
      },
    },
  },
  plugins: [],
};

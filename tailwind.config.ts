import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#eef2f9", 100: "#d5deef", 200: "#aebfe0", 300: "#7f97c9", 400: "#5370ae", 500: "#355291", 600: "#253d74", 700: "#1b2e5a", 800: "#132143", 900: "#0c1630", 950: "#070d1e" },
        gold: { 50: "#fbf7ec", 100: "#f5ebcc", 200: "#ead595", 300: "#dfbe5f", 400: "#d4a93a", 500: "#c09028", 600: "#9c701f", 700: "#77531c", 800: "#5c401b", 900: "#4d3619" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#081425",
        sidebar: "#101E32",
        card: "#152A44",
        "card-2": "#112339",
        line: "#29435F",
        accent: { DEFAULT: "#319BFF", soft: "#1B3A5E" },
        ok: "#20C997",
        warn: "#F5B942",
        danger: "#F05265",
        ink: { DEFAULT: "#F4F7FB", 2: "#B9C7D8", 3: "#7F93AB" },
        violet: { DEFAULT: "#8B7CF6", soft: "#2A2558" },
      },
      fontFamily: { sans: ["Heebo", "Segoe UI", "Arial", "sans-serif"], mono: ["Consolas", "ui-monospace", "monospace"] },
      boxShadow: {
        card: "0 8px 24px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
        glow: "0 0 0 1px rgba(49,155,255,0.6), 0 0 22px -2px rgba(49,155,255,0.55)",
        "glow-ok": "0 0 0 1px rgba(32,201,151,0.55), 0 0 22px -4px rgba(32,201,151,0.45)",
        "glow-violet": "0 0 0 1px rgba(139,124,246,0.55), 0 0 22px -4px rgba(139,124,246,0.45)",
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
    },
  },
  plugins: [],
} satisfies Config;

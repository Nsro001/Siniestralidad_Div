import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        noergon: { navy: "var(--ng-navy)", primary: "var(--ng-primary)", surface: "var(--ng-surface)", border: "var(--ng-border)", muted: "var(--ng-text-muted)" },
        ink: "#151314",
        sand: "#f3efe7",
        ember: "#e2734a",
        moss: "#5b6b4f",
        ocean: "#2b6f8c",
      },
      boxShadow: {
        "soft-xl": "0 20px 45px rgba(21, 19, 20, 0.15)",
      },
    },
  },
  plugins: [],
} satisfies Config;

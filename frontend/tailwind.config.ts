import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"Instrument Sans\"", "sans-serif"],
      },
      colors: {
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

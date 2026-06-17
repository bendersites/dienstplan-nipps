import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        nipps: {
          red: "#dc2626",
          green: "#16a34a",
          blue: "#2563eb",
          gray: "#6b7280",
        }
      }
    },
  },
  plugins: [],
}
export default config
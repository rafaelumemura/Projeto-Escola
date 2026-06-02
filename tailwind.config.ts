import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        mint: "rgb(var(--color-mint) / <alpha-value>)",
        leaf: "rgb(var(--color-leaf) / <alpha-value>)",
        ocean: "rgb(var(--color-ocean) / <alpha-value>)",
        clay: "rgb(var(--color-clay) / <alpha-value>)",
        sun: "rgb(var(--color-sun) / <alpha-value>)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)"
      }
    }
  },
  plugins: []
};

export default config;

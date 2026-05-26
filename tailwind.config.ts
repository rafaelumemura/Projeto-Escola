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
        ink: "#1d2320",
        paper: "#faf8f2",
        mint: "#dcefe7",
        leaf: "#2f7d58",
        ocean: "#256d85",
        clay: "#c46d4b",
        sun: "#f4c95d"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(39, 50, 44, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

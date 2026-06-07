import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1a1f2b",
        mist: "#e8ecf2",
        spruce: "#0f766e",
        accent: "#d4a843",
        ember: "#b42318"
      },
      boxShadow: {
        soft: "0 8px 32px rgba(20, 25, 35, 0.07)"
      },
      borderRadius: {
        xl: "0.75rem"
      }
    }
  },
  plugins: []
};

export default config;

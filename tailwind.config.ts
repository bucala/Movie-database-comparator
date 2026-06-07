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
        ink: "#f8fafc",
        mist: "#182232",
        spruce: "#facc15",
        ember: "#fb7185"
      },
      boxShadow: {
        soft: "0 16px 48px rgba(0, 0, 0, 0.42)"
      }
    }
  },
  plugins: []
};

export default config;

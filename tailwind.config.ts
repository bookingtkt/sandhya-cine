import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#ffd21f",
        ink: "#05080c",
        card: "#0d131b"
      }
    }
  },
  plugins: []
};
export default config;

// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://ryoutoku.github.io",
  base: "/invest-simulation",

  // integrations: [tailwind()],
  output: "static",

  vite: {
    plugins: [tailwindcss()],
  },
});
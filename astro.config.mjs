// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://ryoutoku.github.io",
  base: "/invest-simulation",

  integrations: [react()],
  output: "static",

  vite: {
    plugins: [tailwindcss()],
  },
});

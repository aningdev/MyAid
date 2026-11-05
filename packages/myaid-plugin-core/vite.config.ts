import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    outDir: "lib",
    format: ["esm"],
    platform: "node",
    // Keep `lib/index.js` for Cordis `--patch` / package exports (`type: module`).
    fixedExtension: false,
    dts: false,
    clean: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

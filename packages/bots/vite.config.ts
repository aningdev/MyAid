import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // `index` is the Host plugin (Cordis apply); `remote` is the Typert
    // consumer face the Client mounts. Both are ESM Node entries.
    entry: ["src/index.ts", "src/remote.ts"],
    outDir: "lib",
    format: ["esm"],
    platform: "node",
    fixedExtension: false,
    dts: false,
    clean: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

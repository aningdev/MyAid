import { defineConfig } from "vite-plus";

import { lowerDecorators } from "../../scripts/pack-decorators.ts";

export default defineConfig({
  // The test runner parses the sources with oxc too, which has no decorator pass.
  plugins: [lowerDecorators()],
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
    plugins: [lowerDecorators()],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

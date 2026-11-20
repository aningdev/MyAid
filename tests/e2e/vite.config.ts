import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const support = (name: string): string =>
  fileURLToPath(new URL(`./support/${name}`, import.meta.url));

export default defineConfig({
  // The Client's own tsconfig needs files `nsh` generates; these tests use this one.
  tsconfig: "./tsconfig.json",
  // The Client's relay Carrier imports two NSH modules; outside NSH they are
  // the stand-ins in support/.
  resolve: { alias: { nsh: support("nsh.ts"), websocket: support("websocket.ts") } },
  test: {
    include: ["cases/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

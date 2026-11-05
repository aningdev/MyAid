/**
 * Pre-bundle official `@deepseek-ai/dsh-*` client entrypoints with Node export
 * conditions. NSH defaults to `browser`, which resolves ModuleLoader builds that
 * do not export ESM `installConnection`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "../lib/dsh/sdk.ts");
const outdir = join(here, "../lib/dsh");

const result = await Bun.build({
  entrypoints: [entry],
  target: "node",
  format: "esm",
  outdir,
});

if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

console.log("prepared lib/dsh/sdk.js");

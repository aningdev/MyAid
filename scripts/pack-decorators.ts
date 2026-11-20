/**
 * Make `vp pack` emit standard-decorator code Node can run.
 *
 * The plugins in this repository mark their Remote methods with the official
 * `@Remote` decorator. Rolldown's oxc transform has no TC39 decorator pass: it
 * leaves the syntax in place (and only lowers legacy decorators, which
 * `@Remote` does not accept). esbuild does lower TC39 decorators, so the pack
 * config runs every decorated source file through it before Rolldown bundles.
 */
import { transform } from "esbuild";

const DECORATED = /^[ \t]*@[A-Za-z_$]/m;

/** A Rolldown plugin: lower decorators in this package's own TypeScript. */
export function lowerDecorators() {
  return {
    name: "dsh-bot:lower-decorators",
    async transform(code: string, id: string) {
      if (!id.endsWith(".ts") || id.includes("node_modules") || !DECORATED.test(code)) {
        return null;
      }
      const lowered = await transform(code, {
        loader: "ts",
        target: "es2022",
        sourcefile: id,
        sourcemap: true,
      });
      return { code: lowered.code, map: lowered.map };
    },
  };
}

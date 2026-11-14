/**
 * Fail when the dsh version is not written in exactly one place.
 *
 * Runs first in the root `check`: the catalog's dsh version must equal
 * `apps/host/supported-dsh.json` (which the Host compiles in), and every
 * workspace package must reference that catalog instead of a hand-written pin.
 */
import { pinProblems } from "./dsh-pin.mjs";

const problems = pinProblems();
if (problems.length > 0) {
  console.error("dsh 版本不是唯一真源：");
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(
    "改法：只改根 package.json 的 workspaces.catalog 与 apps/host/supported-dsh.json，" +
      '包内一律写 "catalog:"，然后 bun install。',
  );
  process.exit(1);
}

#!/usr/bin/env bun
/**
 * The client's UI layer against shadcn-nsh's registry: every copied file and
 * `theme.json` must be the registry's (exit 1 when one differs).
 *
 * The CLI is not on npm yet, so it is run from a checkout: `SHADCN_NSH_CLI`
 * points at its entry (`~/Code/shadcn-nsh/packages/cli/src/index.ts` by
 * default). When 0.3.0 is published it becomes a devDependency and this
 * joins `check`.
 */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli =
  process.env.SHADCN_NSH_CLI ?? path.join(homedir(), "Code/shadcn-nsh/packages/cli/src/index.ts");

const run = spawnSync("bun", [cli, "diff", "-c", "."], { cwd: app, stdio: "inherit" });
process.exit(run.status ?? 1);

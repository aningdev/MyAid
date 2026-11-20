// The stack with the real dsh web behind the Host (the pinned `@deepseek-ai/dsh`
// npm package): the product's own plugins
// (`dsh-bots`, `dsh-tickets`) loaded through `--patch`, and a scripted model
// provider on loopback instead of DeepSeek. The Relay, the Host and the
// Devices are the same as in `harness.ts`.

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type Plumbing, startPlumbing, startTeardown } from "./harness";
import { key, type Llm, type Script, startLlm } from "./llm";

const repository = fileURLToPath(new URL("../../../", import.meta.url));

/** The pinned `@deepseek-ai/dsh` the workspace installed (`workspaces.catalog`), by its bin. */
const dsh = join(
  dirname(createRequire(import.meta.url).resolve("@deepseek-ai/dsh/package.json")),
  "lib/bin.js",
);

export interface RealStack extends Plumbing {
  readonly llm: Llm;
  /** An empty directory for Sessions to work in. */
  readonly workspace: string;
  stop(): Promise<void>;
}

/**
 * Starts the stack. The Host builds dsh's environment from a login shell, so the
 * provider address and the key reach dsh through the `HOME` that shell reads
 * (a `.zshenv` in the temporary root); the Owner's own login files are never
 * read and the key is the fixed mock one.
 */
export async function startRealStack(script: Script): Promise<RealStack> {
  const teardown = await startTeardown();
  try {
    const llm = teardown.add(await startLlm(script));
    const home = join(teardown.root, "home");
    await mkdir(home, { recursive: true });
    await writeFile(
      join(home, ".zshenv"),
      [
        // The bin's `#!/usr/bin/env node` must find the node running this test.
        `export PATH='${dirname(process.execPath)}':"$PATH"`,
        `export DEEPSEEK_BASE_URL='${llm.baseUrl}' DEEPSEEK_API_KEY='${key}'`,
        "",
      ].join("\n"),
    );
    const workspace = join(teardown.root, "work");
    await mkdir(workspace);
    const patch = join(teardown.root, "plugins.patch.yml");
    const rows = ["bots", "tickets"].map((plugin) => {
      const entry = pathToFileURL(join(repository, "packages", plugin, "lib/index.js")).href;
      return `    - id: ${plugin}\n      name: ${JSON.stringify(entry)}\n`;
    });
    await writeFile(patch, `- insert:\n${rows.join("")}`);
    const plumbing = await startPlumbing(teardown, {
      args: ["--dsh", dsh, "--patch", patch],
      env: { HOME: home },
    });
    await plumbing.startDsh();
    return { ...plumbing, llm, workspace, stop: () => teardown.stop() };
  } catch (error) {
    await teardown.stop();
    throw error;
  }
}

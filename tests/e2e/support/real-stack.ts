// The stack with the real dsh web behind the Host: the product's own plugins
// (`dsh-bots`, `dsh-tickets`) loaded through `--patch`, and a scripted model
// provider on loopback instead of DeepSeek. The Relay, the Host and the
// Devices are the same as in `harness.ts`.

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { type Plumbing, startPlumbing, startTeardown } from "./harness";
import { key, type Llm, type Script, startLlm } from "./llm";

const repository = fileURLToPath(new URL("../../../", import.meta.url));

/** Whether the official `dsh` CLI is installed where the Host looks for it. */
export const officialDsh: boolean = (() => {
  try {
    execFileSync("/bin/zsh", ["-lc", "command -v dsh"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

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
      `export DEEPSEEK_BASE_URL='${llm.baseUrl}' DEEPSEEK_API_KEY='${key}'\n`,
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
      args: ["--official-dsh", "--patch", patch],
      env: { HOME: home },
    });
    await plumbing.startDsh();
    return { ...plumbing, llm, workspace, stop: () => teardown.stop() };
  } catch (error) {
    await teardown.stop();
    throw error;
  }
}

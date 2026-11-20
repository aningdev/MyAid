// The pin checks must fail where they are meant to: a dsh package the catalog
// lists without the `dsh-` prefix, and a manifest under `tests/`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { pinProblems } from "./dsh-pin.mjs";

/** A repository tree with one pinned version, plus whatever `extra` adds. */
function tree(catalog, manifests = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dsh-pin-test-"));
  const write = (path, value) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(value));
  };
  write("package.json", { name: "@dsh-bot/workspace", workspaces: { catalog } });
  write("apps/host/supported-dsh.json", { version: "0.2.2-rc.5" });
  for (const [path, manifest] of Object.entries(manifests)) write(path, manifest);
  return dir;
}

test("the bare dsh package is held to the one dsh version", () => {
  const dir = tree({ "@deepseek-ai/dsh": "0.2.2-rc.4", "@deepseek-ai/dsh-llm": "0.2.2-rc.5" });
  try {
    assert.match(pinProblems(dir).join("\n"), /dsh 版本必须只有一个/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a manifest under tests/ must use the catalog", () => {
  const dir = tree(
    { "@deepseek-ai/dsh": "0.2.2-rc.5" },
    {
      "tests/e2e/package.json": {
        name: "@dsh-bot/e2e",
        devDependencies: { "@deepseek-ai/dsh": "0.2.2-rc.5" },
      },
    },
  );
  try {
    assert.match(
      pinProblems(dir).join("\n"),
      /@dsh-bot\/e2e 的 devDependencies\.@deepseek-ai\/dsh 写死了/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

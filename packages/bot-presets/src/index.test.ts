import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  applyPluginOverrides,
  applySkillProvider,
  decodeComposition,
  encodeComposition,
  hasSkillSurface,
  resolveOverride,
  rowKey,
  SKILL_ROW_ID,
} from "./composition.ts";
import { storedPresetSchema } from "./domain.ts";
import { derivedPresetId } from "./ids.ts";
import { materializeSkills, skillRoot } from "./skills.ts";

const BASE = `- id: persona
  name: '@deepseek-ai/dsh-persona'
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
- id: skill-registry
  name: '@deepseek-ai/dsh-skill'
- id: skill-files
  name: '@deepseek-ai/dsh-skill-filesystem'
- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
- id: tool-present
  name: '@deepseek-ai/dsh-tool-present'
`;

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bot-presets-"));
  tempDirs.push(dir);
  return dir;
}

describe("derived preset ids", () => {
  it("are stable, namespaced and filesystem-safe", () => {
    const id = derivedPresetId("bot/with spaces");
    expect(id.startsWith("bot-presets-bot-with-spaces-")).toBe(true);
    expect(derivedPresetId("bot/with spaces")).toBe(id);
    expect(id).not.toBe(derivedPresetId("bot-with-spaces"));
  });

  it("rejects an empty bot id", () => {
    expect(() => derivedPresetId("   ")).toThrow(/Bot id/);
  });
});

describe("preset composition", () => {
  it("parses and re-renders the Loader's !!js dialect", () => {
    const rows = decodeComposition(BASE);
    expect(rows).toHaveLength(6);
    const again = encodeComposition(rows);
    expect(again).toContain("!!js process.platform === 'win32'");
  });

  it("switches a row by entry id and preserves the rest", () => {
    const rows = decodeComposition(BASE);
    applyPluginOverrides(rows, [
      { entryId: "tool-bash", moduleName: "@deepseek-ai/dsh-tool-bash", enabled: true },
    ]);
    expect(rows.find((row) => row.id === "tool-bash")?.disabled).toBe(false);
    expect(rows.find((row) => row.id === "persona")?.disabled).toBeUndefined();
  });

  it("switches an anonymous row by module name", () => {
    const rows = decodeComposition(
      "- name: '@deepseek-ai/dsh-tool-present'\n- name: '@deepseek-ai/dsh-persona'\n",
    );
    expect(rowKey(rows[0]!)).toBe("name:@deepseek-ai/dsh-tool-present");
    applyPluginOverrides(rows, [
      { entryId: null, moduleName: "@deepseek-ai/dsh-tool-present", enabled: false },
    ]);
    expect(rows[0]?.disabled).toBe(true);
  });

  it("refuses unknown, ambiguous and group rows", () => {
    const rows = decodeComposition(BASE);
    expect(() =>
      resolveOverride(rows, {
        entryId: "missing",
        moduleName: "@deepseek-ai/dsh-tool-bash",
        enabled: false,
      }),
    ).toThrow(/没有插件行/);

    const duplicated = decodeComposition(
      "- name: '@deepseek-ai/dsh-tool-present'\n- name: '@deepseek-ai/dsh-tool-present'\n",
    );
    expect(() =>
      resolveOverride(duplicated, {
        entryId: null,
        moduleName: "@deepseek-ai/dsh-tool-present",
        enabled: false,
      }),
    ).toThrow(/不唯一/);

    const grouped = decodeComposition(
      "- id: group\n  name: cordis:group\n  group: true\n  config: []\n",
    );
    expect(() =>
      resolveOverride(grouped, {
        entryId: "group",
        moduleName: "cordis:group",
        enabled: false,
      }),
    ).toThrow(/分组行/);
  });

  it("switches a row inside a nested group by its Loader path", () => {
    const rows = decodeComposition(`- id: planning
  name: cordis:group
  group: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
    - id: tool-skill
      name: '@deepseek-ai/dsh-tool-skill'
- id: skill-registry
  name: '@deepseek-ai/dsh-skill'
`);
    expect(hasSkillSurface(rows)).toBe(true);
    applyPluginOverrides(rows, [
      { entryId: "planning:plan-mode", moduleName: "@deepseek-ai/dsh-plan-mode", enabled: false },
    ]);
    const group = rows[0] as { config: { id: string; disabled?: boolean }[] };
    expect(group.config.find((row) => row.id === "plan-mode")?.disabled).toBe(true);
  });

  it("mounts the private skill provider only when the base has the skill surface", () => {
    const rows = decodeComposition(BASE);
    expect(hasSkillSurface(rows)).toBe(true);
    const next = applySkillProvider(rows, "/tmp/skills");
    expect(next.at(-1)?.id).toBe(SKILL_ROW_ID);
    expect(next.at(-1)?.config).toMatchObject({
      providerName: "bot-presets-skills",
      includeDefaultRoots: false,
      customSkillDirs: ["/tmp/skills"],
    });
    expect(applySkillProvider(next, null).some((row) => row.id === SKILL_ROW_ID)).toBe(false);
    expect(
      hasSkillSurface(decodeComposition("- id: persona\n  name: '@deepseek-ai/dsh-persona'\n")),
    ).toBe(false);
  });
});

describe("skill materialization", () => {
  it("copies a directory bundle and reads its frontmatter name", async () => {
    const root = await tempDir();
    const source = join(root, "source", "release");
    await mkdir(source, { recursive: true });
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname: release-notes\ndescription: Write release notes\n---\n\n# Release\n",
    );
    const data = join(root, "data");
    const skills = await materializeSkills(data, "preset-1", [source]);
    expect(skills).toEqual([{ name: "release-notes", path: source }]);
    expect(
      await readFile(join(skillRoot(data, "preset-1"), "release-notes", "SKILL.md"), "utf8"),
    ).toContain("# Release");
  });

  it("copies a flat skill file and replaces the previous root", async () => {
    const root = await tempDir();
    const file = join(root, "flat.md");
    await writeFile(file, "---\nname: flat-notes\n---\n\nBody\n");
    const data = join(root, "data");
    expect(await materializeSkills(data, "preset-1", [file])).toEqual([
      { name: "flat-notes", path: file },
    ]);
    expect(await materializeSkills(data, "preset-1", [])).toEqual([]);
    await expect(readFile(join(skillRoot(data, "preset-1"), "flat-notes.md"))).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("skips missing sources only when the caller tolerates them", async () => {
    const root = await tempDir();
    const data = join(root, "data");
    await expect(materializeSkills(data, "p", [join(root, "gone")])).rejects.toThrow(/ENOENT/);
    expect(
      await materializeSkills(data, "p", [join(root, "gone")], { tolerateMissing: true }),
    ).toEqual([]);
  });
});

describe("stored records", () => {
  it("validate the body and keep it out of the public record", () => {
    const parsed = storedPresetSchema.parse({
      presetId: "bot-presets-x",
      botId: "x",
      basePresetId: "standard",
      label: "Ada",
      skills: [],
      plugins: [],
      baseYaml: BASE,
      updatedAt: 1,
    });
    expect(parsed.baseYaml).toBe(BASE);
  });
});

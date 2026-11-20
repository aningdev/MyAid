import { expect, test } from "nsh/test";

import { emptyRegistry, type BotRegistry } from "../../features/bots/model";
import { registry } from "../../features/bots/state";
import { workspaces } from "../../features/workspace/state";
import { t } from "../../lib/i18n";
import { claimSegment, createBot, createTemplate, initializeBot } from "../../test/bots-fixture";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import {
  buildApplicationMenu,
  COMMANDS,
  commandById,
  menuCommands,
  paletteItems,
} from "./commands";
import { openBot, setPanelBot } from "./state";

function sample(): BotRegistry {
  return claimSegment(
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl" },
        "bot",
      ),
      "bot",
    ),
    "bot",
    "s1",
    "ws-work",
  );
}

function section(menu: ReturnType<typeof buildApplicationMenu>, label: string) {
  const found = menu.find((item) => "label" in item && item.label === label);
  if (!found || !("submenu" in found)) throw new Error(`no ${label} menu`);
  return found.submenu ?? [];
}

test("command ids and shortcuts are unique", () => {
  const ids = COMMANDS.map((command) => command.id);
  expect(new Set(ids).size).toBe(ids.length);
  const shortcuts = COMMANDS.flatMap((command) => (command.shortcut ? [command.shortcut] : []));
  expect(new Set(shortcuts).size).toBe(shortcuts.length);
  // The palette itself is a command but not one of its rows.
  expect(paletteItems().items.some((item) => item.id === "cmd:palette.open")).toBe(false);
  // ⌘N makes a Bot; ⌘, opens Settings.
  expect(commandById("bot.new")?.shortcut).toBe("mod+n");
  expect(commandById("settings.open")?.shortcut).toBe("mod+,");
  // The Inspector is gone with its shortcut.
  expect(commandById("inspector.toggle")).toBeUndefined();
  expect(commandById("session.new")).toBeUndefined();
});

test("the menu is built from the command table: labels, shortcuts, sections", () => {
  const menu = buildApplicationMenu(COMMANDS, { mac: true });
  expect(menu.map((item) => ("label" in item ? item.label : ""))).toEqual([
    "dsh-bot",
    t("menu.file"),
    t("menu.edit"),
    t("menu.view"),
    t("menu.chat"),
    t("menu.window"),
  ]);
  // The app menu carries Settings on macOS too, as the platform expects.
  const appMenu = section(menu, "dsh-bot");
  expect(
    appMenu.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        item.label === t("command.settings"),
    ),
  ).toBe(true);

  for (const command of menuCommands()) {
    if (!command.menu) continue;
    const items = section(menu, command.menu.section).filter(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        item.label === t(command.label),
    );
    expect(items).toHaveLength(1);
    const first = items[0];
    expect(
      typeof first === "object" && first !== null && "shortcut" in first
        ? first.shortcut
        : undefined,
    ).toBe(command.shortcut);
  }

  // Every command that names a section is in the menu exactly once.
  const menuLabels = [t("menu.file"), t("menu.view"), t("menu.chat")].flatMap((label) =>
    section(menu, label).flatMap((item) =>
      typeof item === "object" && item !== null && "label" in item && item.label
        ? [item.label]
        : [],
    ),
  );
  for (const command of menuCommands()) {
    expect(menuLabels.filter((label) => label === t(command.label))).toHaveLength(1);
  }
});

test("the palette lists every command and every Bot, archived ones included", () => {
  const base = sample();
  const withArchived = {
    ...base,
    bots: base.bots.map((bot) => (bot.name === "Ada" ? { ...bot, archived: true } : bot)),
  };
  const withBob = createBot(withArchived, { name: "Bob", templateId: "tmpl" }, "bot2");
  registry.set(withBob);
  workspaces.set(
    workspaceProjection({
      rows: [
        workspaceRow({
          id: "ws-work",
          path: "/work/dsh-bot",
          title: "dsh-bot",
          sessionIds: ["s1"],
        }),
      ],
    }),
  );
  try {
    const { items, jumps } = paletteItems();
    for (const command of COMMANDS) {
      const present = items.some((item) => item.id === `cmd:${command.id}`);
      expect(present).toBe(command.inPalette !== false);
    }
    const ada = items.find((item) => item.id === "jump:bot:bot");
    expect(ada?.label).toBe("Ada");
    expect(ada?.group).toBe(t("palette.group.archived"));
    expect(ada?.keywords).toContain("/work/dsh-bot");
    expect(
      items.some((item) => item.id === "jump:bot:bot2" && item.group === t("palette.group.bots")),
    ).toBe(true);
    // No Dialogue or Session is a place of its own any more.
    expect(items.some((item) => item.id.startsWith("jump:dialogue:"))).toBe(false);
    expect(items.some((item) => item.id.startsWith("jump:session:"))).toBe(false);
    expect(jumps.get("jump:bot:bot")).toBe("bot");
  } finally {
    registry.set(emptyRegistry());
    workspaces.set(workspaceProjection());
  }
});

test("a palette id never collides between a command and a place", () => {
  registry.set(sample());
  try {
    const ids = paletteItems().items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  } finally {
    registry.set(emptyRegistry());
  }
});

test("enabled states follow the active Pane's Bot", () => {
  registry.set(sample());
  try {
    const enabled = (id: string) => commandById(id)?.enabled?.() ?? true;
    setPanelBot("panel-1", null);
    expect(enabled("bot.details")).toBe(false);
    expect(enabled("composer.focus")).toBe(false);

    openBot("bot");
    expect(enabled("bot.details")).toBe(true);
    // A Bot's most recent claim stands in for its conversation without a Host.
    expect(enabled("composer.focus")).toBe(true);
    // No live row without a Host: Stop stays disabled.
    expect(enabled("session.stop")).toBe(false);
  } finally {
    registry.set(emptyRegistry());
    setPanelBot("panel-1", null);
  }
});

test("the palette reads the Registry the Client is showing", () => {
  registry.set(sample());
  try {
    expect(paletteItems().items.find((item) => item.id === "jump:bot:bot")?.label).toBe("Ada");
    registry.set({
      ...registry(),
      bots: registry().bots.map((bot) => (bot.id === "bot" ? { ...bot, name: "Ada L" } : bot)),
    });
    expect(paletteItems().items.find((item) => item.id === "jump:bot:bot")?.label).toBe("Ada L");
  } finally {
    registry.set(emptyRegistry());
  }
});

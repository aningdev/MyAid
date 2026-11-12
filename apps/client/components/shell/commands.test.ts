import { expect, test } from "nsh/test";

import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  serializeRegistry,
  type BotRegistry,
} from "../../features/bots/model";
import { registry } from "../../features/bots/state";
import {
  buildApplicationMenu,
  COMMANDS,
  commandById,
  menuCommands,
  paletteItems,
} from "./commands";
import { botAddress, sessionAddress } from "./navAddresses";
import { openAddress } from "./state";

function sample(): BotRegistry {
  return claimSession(
    createDialogue(
      initializeBot(
        createBot(
          createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
          { name: "Ada", templateId: "tmpl" },
          "bot",
        ),
        "bot",
      ),
      { botId: "bot", workspacePath: "/work/myaid" },
      "dlg",
    ),
    "dlg",
    "s1",
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
});

test("the menu is built from the command table: labels, shortcuts, sections", () => {
  const menu = buildApplicationMenu(COMMANDS, { mac: true });
  expect(menu.map((item) => ("label" in item ? item.label : ""))).toEqual([
    "MyAid",
    "File",
    "Edit",
    "View",
    "Chat",
    "Window",
  ]);

  for (const command of menuCommands()) {
    if (!command.menu) continue;
    const items = section(menu, command.menu.section).filter(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        item.label === command.label,
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
  const menuLabels = ["File", "View", "Chat"].flatMap((label) =>
    section(menu, label).flatMap((item) =>
      typeof item === "object" && item !== null && "label" in item && item.label
        ? [item.label]
        : [],
    ),
  );
  for (const command of menuCommands()) {
    expect(menuLabels.filter((label) => label === command.label)).toHaveLength(1);
  }
});

test("the palette lists every command and every Bot, Dialogue and Session", () => {
  registry.set(sample());
  try {
    const { items, jumps } = paletteItems();
    for (const command of COMMANDS) {
      const present = items.some((item) => item.id === `cmd:${command.id}`);
      expect(present).toBe(command.inPalette !== false);
    }
    expect(items.some((item) => item.id === "jump:bot:bot" && item.label === "Ada")).toBe(true);
    expect(items.some((item) => item.id === "jump:dialogue:dlg")).toBe(true);
    const session = items.find((item) => item.id === "jump:session:s1");
    expect(session?.label).toBe("未命名上下文");
    expect(session?.keywords).toContain("/work/myaid");
    expect(session?.keywords).toContain("Ada");
    expect(jumps.get("jump:session:s1")?.sessionId).toBe("s1");
  } finally {
    registry.set(emptyRegistry());
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

test("enabled states follow the active Panel", () => {
  registry.set(sample());
  try {
    const enabled = (id: string) => commandById(id)?.enabled?.() ?? true;
    openAddress(botAddress({ id: "bot", name: "Ada" }));
    expect(enabled("session.new")).toBe(true);
    expect(enabled("bot.settings")).toBe(true);
    expect(enabled("inspector.toggle")).toBe(false);
    expect(enabled("composer.focus")).toBe(false);

    openAddress(
      sessionAddress({
        sessionId: "s1",
        label: "First run",
        botId: "bot",
        dialogueId: "dlg",
      }),
    );
    expect(enabled("inspector.toggle")).toBe(true);
    expect(enabled("composer.focus")).toBe(true);
    // No live row without a Host: Stop stays disabled.
    expect(enabled("session.stop")).toBe(false);
  } finally {
    registry.set(emptyRegistry());
  }
});

test("the registry's serialized form is the one the palette reads", () => {
  const text = serializeRegistry(sample());
  expect(text).toContain('"version": 4');
});

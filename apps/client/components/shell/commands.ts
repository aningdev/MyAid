/**
 * One table for the shell's commands: the application menu, the ⌘K palette
 * and the keyboard shortcuts all read it, so a label, a shortcut and an
 * enabled state are written once. Menu sections and separators are data too;
 * `buildApplicationMenu` only lays them out.
 *
 * Enabled states read the active Pane and the live Session rows, so the menu
 * is rebuilt as they change (Shell runs the build in an `effect`).
 */
import { signal } from "nsh";
import type { CommandItem } from "nsh/base";
import type { MenuItem } from "nsh/desktop";

import { openBotDetails } from "../../features/bots/details";
import type { Bot } from "../../features/bots/model";
import { openNewBot } from "../../features/bots/newBot";
import { currentSegmentOf, workingDirectoryOf } from "../../features/bots/sessions";
import { registry } from "../../features/bots/state";
import { requestComposerFocus } from "../../features/dialogue/chat/focus";
import { controllerFor, sessionList } from "../../features/dialogue/session/runtime";
import { newTopic } from "../../features/workspace/conversation";
import { workspaces } from "../../features/workspace/state";
import { t, type MessageKey } from "../../lib/i18n";
import type { IconName } from "../ui";
import { collectPanelIds } from "./dock";
import { toggleNavOpen } from "./layout";
import { requestNavSearchFocus } from "./navFilter";
import { openSettings } from "./settings";
import { openBot } from "./state";
import { activeBotId, closeActivePanel, dockLayout, focusPanel, splitActivePanel } from "./state";

export type CommandMenuSection = "File" | "View" | "Chat";

/** What the active Pane gives a command: the Bot it shows, and its segment. */
export type CommandContext = {
  bot: Bot | null;
  sessionId: string | null;
  running: boolean;
};

export type ShellCommand = {
  id: string;
  /** Its name in the menu, the palette and the help, in the catalog. */
  label: MessageKey;
  /** One section of the palette (commands share one). */
  group: MessageKey;
  keywords?: string[];
  /** As `keymap` names it; the Shell binds it. */
  shortcut?: string;
  /** Its place in the application menu; absent from the menu without it. */
  menu?: { section: CommandMenuSection; separatorBefore?: boolean };
  icon: IconName;
  /** Default true. */
  enabled?: () => boolean;
  /** The palette leaves it out (a command that is itself the palette). */
  inPalette?: boolean;
  run: () => void | Promise<void>;
};

/** The active Pane's Bot and segment, read now (signals subscribe the build). */
export function commandContext(): CommandContext {
  const botId = activeBotId();
  const bot = botId ? (registry().bots.find((item) => item.id === botId) ?? null) : null;
  const sessionId = botId
    ? (currentSegmentOf({ registry: registry(), workspaces: workspaces(), botId })?.segment
        .sessionId ?? null)
    : null;
  const row = sessionId ? sessionList().find((item) => item.id === sessionId) : undefined;
  return { bot, sessionId, running: row?.running === true };
}

function stopActive(): void {
  const id = commandContext().sessionId;
  if (!id) return;
  const row = sessionList().find((item) => item.id === id);
  if (!row?.running) return;
  void controllerFor(id).cancel();
}

function focusComposer(): void {
  const id = commandContext().sessionId;
  if (id) requestComposerFocus(id);
}

function botDetails(): void {
  const bot = commandContext().bot;
  if (bot) openBotDetails(bot.id);
}

function startNewTopic(): void {
  const bot = commandContext().bot;
  if (bot) void newTopic(bot.id);
}

/** The command table, in palette order. */
export const COMMANDS: readonly ShellCommand[] = [
  {
    id: "bot.new",
    label: "command.newBot",
    group: "palette.group.commands",
    keywords: ["create", "agent", "assistant"],
    shortcut: "mod+n",
    menu: { section: "File" },
    icon: "spark",
    run: openNewBot,
  },
  {
    id: "panel.close",
    label: "command.closePanel",
    group: "palette.group.commands",
    shortcut: "mod+w",
    menu: { section: "File", separatorBefore: true },
    icon: "close",
    enabled: () => collectPanelIds(dockLayout().center).length > 1,
    run: closeActivePanel,
  },
  {
    id: "settings.open",
    label: "command.settings",
    group: "palette.group.commands",
    keywords: ["preferences", "providers", "background", "about"],
    shortcut: "mod+,",
    menu: { section: "File", separatorBefore: true },
    icon: "sliders",
    run: openSettings,
  },
  {
    id: "nav.toggle",
    label: "command.toggleNavigator",
    group: "palette.group.commands",
    keywords: ["sidebar", "hide", "show"],
    shortcut: "mod+b",
    menu: { section: "View" },
    icon: "sidebar",
    run: toggleNavOpen,
  },
  {
    id: "nav.search",
    label: "command.searchBots",
    group: "palette.group.commands",
    keywords: ["filter", "find", "sidebar"],
    shortcut: "mod+f",
    menu: { section: "View" },
    icon: "search",
    run: requestNavSearchFocus,
  },
  {
    id: "panel.split-right",
    label: "command.splitRight",
    group: "palette.group.commands",
    shortcut: "mod+\\",
    menu: { section: "View", separatorBefore: true },
    icon: "panel-right",
    run: () => {
      splitActivePanel("right");
    },
  },
  {
    id: "panel.split-down",
    label: "command.splitDown",
    group: "palette.group.commands",
    shortcut: "mod+shift+\\",
    menu: { section: "View" },
    icon: "panel-bottom",
    run: () => {
      splitActivePanel("down");
    },
  },
  {
    id: "panel.previous",
    label: "command.previousPanel",
    group: "palette.group.commands",
    shortcut: "mod+[",
    menu: { section: "View", separatorBefore: true },
    icon: "back",
    enabled: () => collectPanelIds(dockLayout().center).length > 1,
    run: () => focusPanel(-1),
  },
  {
    id: "panel.next",
    label: "command.nextPanel",
    group: "palette.group.commands",
    shortcut: "mod+]",
    menu: { section: "View" },
    icon: "chevron",
    enabled: () => collectPanelIds(dockLayout().center).length > 1,
    run: () => focusPanel(1),
  },
  {
    id: "palette.open",
    label: "command.palette",
    group: "palette.group.commands",
    keywords: ["go to", "jump", "search"],
    shortcut: "mod+k",
    menu: { section: "View", separatorBefore: true },
    icon: "search",
    inPalette: false,
    run: toggleCommandPalette,
  },
  {
    id: "session.stop",
    label: "command.stop",
    group: "palette.group.commands",
    keywords: ["cancel", "interrupt", "generating"],
    shortcut: "mod+.",
    menu: { section: "Chat" },
    icon: "pause",
    enabled: () => commandContext().running,
    run: stopActive,
  },
  {
    id: "conversation.new",
    label: "command.newTopic",
    group: "palette.group.commands",
    keywords: ["new topic", "new segment", "/new", "fresh", "conversation"],
    menu: { section: "Chat", separatorBefore: true },
    icon: "chat",
    enabled: () => commandContext().bot?.status === "ready",
    run: startNewTopic,
  },
  {
    id: "composer.focus",
    label: "command.focusComposer",
    group: "palette.group.commands",
    shortcut: "mod+l",
    menu: { section: "Chat" },
    icon: "chat",
    enabled: () => commandContext().sessionId !== null,
    run: focusComposer,
  },
  {
    id: "bot.details",
    label: "command.botDetails",
    group: "palette.group.commands",
    keywords: ["profile", "preset", "model", "skills", "plugins", "archive", "delete"],
    menu: { section: "Chat", separatorBefore: true },
    icon: "sliders",
    enabled: () => commandContext().bot !== null,
    run: botDetails,
  },
];

export function commandById(id: string): ShellCommand | undefined {
  return COMMANDS.find((command) => command.id === id);
}

export function runCommand(id: string): void {
  const command = commandById(id);
  if (!command) return;
  if (command.enabled && !command.enabled()) return;
  void command.run();
}

// --- palette ---------------------------------------------------------------

const paletteOpen = signal(false);

export function commandPaletteOpen(): boolean {
  return paletteOpen();
}

export function openCommandPalette(): void {
  paletteOpen.set(true);
}

export function closeCommandPalette(): void {
  paletteOpen.set(false);
}

export function toggleCommandPalette(): void {
  paletteOpen.set(!paletteOpen());
}

/** A jump the palette offers: a Bot, by id. */
export type PaletteJump = {
  id: string;
  label: string;
  keywords: string[];
  group: MessageKey;
  botId: string;
};

/**
 * Every Bot the registry holds, as a jump. Archived Bots are left in: typing
 * their name is how a person finds one again.
 */
export function paletteJumps(): PaletteJump[] {
  const state = registry();
  const paths = (id: string) => {
    const path = workingDirectoryOf(state, workspaces(), id);
    return path ? [path] : [];
  };
  return state.bots.map((bot) => ({
    id: `jump:bot:${bot.id}`,
    label: bot.name,
    keywords: [
      "bot",
      bot.description ?? "",
      ...paths(bot.id),
      ...(bot.archived ? ["archived"] : []),
      ...(bot.status === "draft" ? ["draft"] : []),
    ].filter(Boolean),
    group: bot.archived ? "palette.group.archived" : "palette.group.bots",
    botId: bot.id,
  }));
}

/** The palette's rows and what choosing each does, built from the table and the registry. */
export function paletteItems(): {
  items: CommandItem[];
  jumps: Map<string, string>;
} {
  const items: CommandItem[] = [];
  const jumps = new Map<string, string>();
  for (const command of COMMANDS) {
    if (command.inPalette === false) continue;
    items.push({
      id: `cmd:${command.id}`,
      label: t(command.label),
      keywords: command.keywords ?? [],
      group: t(command.group),
      ...(command.shortcut ? { shortcut: command.shortcut } : {}),
      ...(command.enabled ? { disabled: !command.enabled() } : {}),
    });
  }
  for (const jump of paletteJumps()) {
    items.push({
      id: jump.id,
      label: jump.label,
      keywords: jump.keywords,
      group: t(jump.group),
    });
    jumps.set(jump.id, jump.botId);
  }
  return { items, jumps };
}

/** The icon a palette row shows: the command's, or the Bot's. */
export function paletteIcon(id: string): IconName {
  if (id.startsWith("cmd:")) return commandById(id.slice(4))?.icon ?? "search";
  return "spark";
}

/** Choose a palette row: run a command, or open a Bot's Pane. */
export function runPaletteItem(id: string): void {
  if (id.startsWith("cmd:")) {
    runCommand(id.slice(4));
    return;
  }
  const botId = paletteItems().jumps.get(id);
  if (botId) openBot(botId);
}

// --- application menu ------------------------------------------------------

const EDIT_MENU: MenuItem[] = [
  { role: "undo" },
  { role: "redo" },
  { type: "separator" },
  { role: "cut" },
  { role: "copy" },
  { role: "paste" },
  { role: "selectAll" },
];

const WINDOW_MENU: MenuItem[] = [
  { role: "minimize" },
  { role: "zoom" },
  { type: "separator" },
  { role: "toggleFullScreen" },
];

function menuItemFor(command: ShellCommand): MenuItem {
  return {
    label: t(command.label),
    ...(command.shortcut ? { shortcut: command.shortcut } : {}),
    disabled: command.enabled ? !command.enabled() : false,
    onSelect: () => runCommand(command.id),
  };
}

function sectionItems(commands: readonly ShellCommand[], section: CommandMenuSection): MenuItem[] {
  const items: MenuItem[] = [];
  for (const command of commands) {
    if (command.menu?.section !== section) continue;
    if (command.menu.separatorBefore && items.length > 0) items.push({ type: "separator" });
    items.push(menuItemFor(command));
  }
  return items;
}

/**
 * The application menu, from the command table. macOS puts the app menu
 * (About, Settings, Hide, Quit) before File; other platforms leave it to the
 * system.
 */
export function buildApplicationMenu(
  commands: readonly ShellCommand[] = COMMANDS,
  options: { mac?: boolean; appName?: string } = {},
): MenuItem[] {
  const menu: MenuItem[] = [];
  if (options.mac !== false) {
    menu.push({
      label: options.appName ?? "MyAid",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: t("command.settings"), shortcut: "mod+,", onSelect: openSettings },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
  menu.push(
    { label: t("menu.file"), submenu: sectionItems(commands, "File") },
    { label: t("menu.edit"), submenu: EDIT_MENU },
    { label: t("menu.view"), submenu: sectionItems(commands, "View") },
    { label: t("menu.chat"), submenu: sectionItems(commands, "Chat") },
    { label: t("menu.window"), submenu: WINDOW_MENU },
  );
  return menu;
}

/** The commands the menu shows, for tests and the palette's consistency check. */
export function menuCommands(commands: readonly ShellCommand[] = COMMANDS): ShellCommand[] {
  return commands.filter((command) => command.menu !== undefined);
}

/**
 * One table for the shell's commands: the application menu, the ⌘K palette
 * and the keyboard shortcuts all read it, so a label, a shortcut and an
 * enabled state are written once. Menu sections and separators are data too;
 * `buildApplicationMenu` only lays them out.
 *
 * Enabled states read the active Panel and the live Session rows, so the
 * menu is rebuilt as they change (Shell runs the build in an `effect`).
 */
import { signal } from "nsh";
import type { CommandItem } from "nsh/base";
import type { MenuItem } from "nsh/desktop";

import { type Bot, type Dialogue } from "../../features/bots/model";
import { openNewBot } from "../../features/bots/newBot";
import { sessionLabel } from "../../features/bots/sessions";
import { openBotSettings } from "../../features/bots/settings";
import { registry } from "../../features/bots/state";
import { requestComposerFocus } from "../../features/dialogue/chat/focus";
import {
  controllerFor,
  creatingSession,
  sessionList,
} from "../../features/dialogue/session/runtime";
import { toggleInspectorOfActivePanel } from "../../features/inspector/state";
import type { IconName } from "../ui";
import { collectPanelIds } from "./dock";
import { toggleNavOpen } from "./layout";
import { sessionAddress } from "./navAddresses";
import { dialogueLabels } from "./navAddresses";
import { workspaceSegment } from "./navAddresses";
import { requestNavSearchFocus } from "./navFilter";
import { dockLayout, closeActivePanel, focusPanel, openAddress, splitActivePanel } from "./state";
import { activeAddress } from "./state";
import type { NavAddress } from "./types";

export type CommandMenuSection = "File" | "View" | "Chat";

/** What the active Panel gives a command: the object it would act on. */
export type CommandContext = {
  address: NavAddress | null;
  bot: Bot | null;
  dialogue: Dialogue | null;
  sessionId: string | null;
  running: boolean;
};

export type ShellCommand = {
  id: string;
  label: string;
  /** One section of the palette (commands share one). */
  group: string;
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

/** What the active Panel is showing, read now (signals subscribe the menu build). */
export function commandContext(): CommandContext {
  const address = activeAddress();
  const bot = address?.botId
    ? (registry().bots.find((item) => item.id === address.botId) ?? null)
    : null;
  const dialogue = address?.dialogueId
    ? (registry().dialogues.find((item) => item.id === address.dialogueId) ?? null)
    : null;
  const sessionId = address?.kind === "session" ? (address.sessionId ?? null) : null;
  const row = sessionId ? sessionList().find((item) => item.id === sessionId) : undefined;
  return { address, bot, dialogue, sessionId, running: row?.running === true };
}

/** The Dialogue a New Session would start in: the Panel's, or the Bot's newest. */
export function contextDialogue(): Dialogue | null {
  const context = commandContext();
  if (context.dialogue && !context.dialogue.archived) return context.dialogue;
  if (!context.bot) return null;
  const dialogues = registry().dialogues.filter(
    (item) => item.botId === context.bot!.id && !item.archived,
  );
  return dialogues[dialogues.length - 1] ?? null;
}

async function newSession(): Promise<void> {
  const dialogue = contextDialogue();
  const bot = dialogue
    ? (registry().bots.find((item) => item.id === dialogue.botId) ?? null)
    : null;
  if (!dialogue || !bot || bot.status !== "ready" || creatingSession()) return;
  try {
    const { createSession } = await import("../../features/dialogue/session/runtime");
    const id = await createSession(dialogue.id);
    const claim = dialogue.claims.find((item) => item.sessionId === id) ?? null;
    openAddress(
      sessionAddress({
        sessionId: id,
        label: sessionLabel(claim ?? { title: null }, null),
        botId: bot.id,
        dialogueId: dialogue.id,
      }),
    );
    requestComposerFocus(id);
  } catch {
    // The runtime puts the reason on sessionError; a chat shows it.
  }
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

function botSettings(): void {
  const bot = commandContext().bot;
  if (bot) openBotSettings(bot.id);
}

/** The command table, in palette order. */
export const COMMANDS: readonly ShellCommand[] = [
  {
    id: "session.new",
    label: "New Session",
    group: "Commands",
    keywords: ["chat", "start", "dialogue"],
    shortcut: "mod+n",
    menu: { section: "File" },
    icon: "plus",
    enabled: () => !!contextDialogue() && commandContext().dialogue?.archived !== true,
    run: () => void newSession(),
  },
  {
    id: "bot.new",
    label: "New Bot…",
    group: "Commands",
    keywords: ["create", "agent", "assistant"],
    shortcut: "mod+shift+n",
    menu: { section: "File" },
    icon: "spark",
    run: openNewBot,
  },
  {
    id: "panel.close",
    label: "Close Panel",
    group: "Commands",
    shortcut: "mod+w",
    menu: { section: "File", separatorBefore: true },
    icon: "close",
    enabled: () => collectPanelIds(dockLayout().center).length > 1,
    run: closeActivePanel,
  },
  {
    id: "nav.toggle",
    label: "Toggle Navigator",
    group: "Commands",
    keywords: ["sidebar", "hide", "show"],
    shortcut: "mod+b",
    menu: { section: "View" },
    icon: "sidebar",
    run: toggleNavOpen,
  },
  {
    id: "nav.search",
    label: "Search Navigator",
    group: "Commands",
    keywords: ["filter", "find", "sidebar"],
    shortcut: "mod+f",
    menu: { section: "View" },
    icon: "search",
    run: requestNavSearchFocus,
  },
  {
    id: "inspector.toggle",
    label: "Toggle Inspector",
    group: "Commands",
    shortcut: "alt+mod+i",
    menu: { section: "View" },
    icon: "panel-right",
    enabled: () => commandContext().sessionId !== null,
    run: toggleInspectorOfActivePanel,
  },
  {
    id: "panel.split-right",
    label: "Split Right",
    group: "Commands",
    shortcut: "mod+\\",
    menu: { section: "View", separatorBefore: true },
    icon: "panel-right",
    run: () => splitActivePanel("right"),
  },
  {
    id: "panel.split-down",
    label: "Split Down",
    group: "Commands",
    shortcut: "mod+shift+\\",
    menu: { section: "View" },
    icon: "panel-bottom",
    run: () => splitActivePanel("down"),
  },
  {
    id: "panel.previous",
    label: "Previous Panel",
    group: "Commands",
    shortcut: "mod+[",
    menu: { section: "View", separatorBefore: true },
    icon: "back",
    enabled: () => collectPanelIds(dockLayout().center).length > 1,
    run: () => focusPanel(-1),
  },
  {
    id: "panel.next",
    label: "Next Panel",
    group: "Commands",
    shortcut: "mod+]",
    menu: { section: "View" },
    icon: "chevron",
    enabled: () => collectPanelIds(dockLayout().center).length > 1,
    run: () => focusPanel(1),
  },
  {
    id: "palette.open",
    label: "Command Palette…",
    group: "Commands",
    keywords: ["go to", "jump", "search"],
    shortcut: "mod+k",
    menu: { section: "View", separatorBefore: true },
    icon: "search",
    inPalette: false,
    run: toggleCommandPalette,
  },
  {
    id: "session.stop",
    label: "Stop",
    group: "Commands",
    keywords: ["cancel", "interrupt", "generating"],
    shortcut: "mod+.",
    menu: { section: "Chat" },
    icon: "pause",
    enabled: () => commandContext().running,
    run: stopActive,
  },
  {
    id: "composer.focus",
    label: "Focus Composer",
    group: "Commands",
    shortcut: "mod+l",
    menu: { section: "Chat" },
    icon: "chat",
    enabled: () => commandContext().sessionId !== null,
    run: focusComposer,
  },
  {
    id: "bot.settings",
    label: "Bot Settings…",
    group: "Commands",
    keywords: ["profile", "preset", "model"],
    menu: { section: "Chat", separatorBefore: true },
    icon: "sliders",
    enabled: () => commandContext().bot !== null,
    run: botSettings,
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

/** A jump the palette offers: a Bot, a Dialogue or a Session, by address. */
export type PaletteJump = {
  id: string;
  label: string;
  keywords: string[];
  group: string;
  address: NavAddress;
};

/** Every Bot, Dialogue and Session the registry holds, as palette jumps. */
export function paletteJumps(): PaletteJump[] {
  const state = registry();
  const rows = new Map(sessionList().map((row) => [row.id, row]));
  const botName = (id: string) => state.bots.find((bot) => bot.id === id)?.name ?? "";
  const dialogues = state.dialogues.filter((dialogue) => !dialogue.archived);
  const names = dialogueLabels({ dialogues, botName });
  const jumps: PaletteJump[] = [];

  for (const bot of state.bots) {
    jumps.push({
      id: `jump:bot:${bot.id}`,
      label: bot.name,
      keywords: ["bot", bot.description ?? "", "agent"].filter(Boolean),
      group: "Bots",
      address: {
        id: `bot:${bot.id}`,
        root: "bots",
        path: [bot.name],
        title: bot.name,
        kind: "bot",
        botId: bot.id,
      },
    });
  }

  for (const dialogue of dialogues) {
    const label = names.get(dialogue.id)?.full ?? workspaceSegment(dialogue.workspacePath);
    jumps.push({
      id: `jump:dialogue:${dialogue.id}`,
      label,
      keywords: [
        "dialogue",
        botName(dialogue.botId),
        dialogue.workspacePath,
        workspaceSegment(dialogue.workspacePath),
      ].filter(Boolean),
      group: "Dialogues",
      address: {
        id: `dialogue:${dialogue.id}`,
        root: "dialogues",
        path: [label],
        title: label,
        kind: "dialogue",
        dialogueId: dialogue.id,
        botId: dialogue.botId,
      },
    });

    for (const claim of dialogue.claims) {
      if (claim.archived) continue;
      const label = rows.get(claim.sessionId)?.label ?? sessionLabel(claim, null);
      jumps.push({
        id: `jump:session:${claim.sessionId}`,
        label,
        keywords: [
          "session",
          "chat",
          botName(dialogue.botId),
          dialogue.workspacePath,
          workspaceSegment(dialogue.workspacePath),
        ].filter(Boolean),
        group: "Sessions",
        address: sessionAddress({
          sessionId: claim.sessionId,
          label,
          botId: dialogue.botId,
          dialogueId: dialogue.id,
        }),
      });
    }
  }
  return jumps;
}

/** The palette's rows and what choosing each does, built from the table and the registry. */
export function paletteItems(): {
  items: CommandItem[];
  jumps: Map<string, NavAddress>;
} {
  const items: CommandItem[] = [];
  const jumps = new Map<string, NavAddress>();
  for (const command of COMMANDS) {
    if (command.inPalette === false) continue;
    items.push({
      id: `cmd:${command.id}`,
      label: command.label,
      keywords: command.keywords ?? [],
      group: command.group,
      ...(command.shortcut ? { shortcut: command.shortcut } : {}),
      ...(command.enabled ? { disabled: !command.enabled() } : {}),
    });
  }
  for (const jump of paletteJumps()) {
    items.push({
      id: jump.id,
      label: jump.label,
      keywords: jump.keywords,
      group: jump.group,
    });
    jumps.set(jump.id, jump.address);
  }
  return { items, jumps };
}

/** The icon a palette row shows: the command's, or the object's kind. */
export function paletteIcon(id: string): IconName {
  if (id.startsWith("cmd:")) return commandById(id.slice(4))?.icon ?? "search";
  if (id.startsWith("jump:bot:")) return "spark";
  if (id.startsWith("jump:dialogue:")) return "chat";
  return "code";
}

/** Choose a palette row: run a command, or open a jump's address. */
export function runPaletteItem(id: string): void {
  if (id.startsWith("cmd:")) {
    runCommand(id.slice(4));
    return;
  }
  const address = paletteItems().jumps.get(id);
  if (address) openAddress(address);
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
    label: command.label,
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
 * (About, Hide, Quit) before File; other platforms leave it to the system.
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
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
  menu.push(
    { label: "File", submenu: sectionItems(commands, "File") },
    { label: "Edit", submenu: EDIT_MENU },
    { label: "View", submenu: sectionItems(commands, "View") },
    { label: "Chat", submenu: sectionItems(commands, "Chat") },
    { label: "Window", submenu: WINDOW_MENU },
  );
  return menu;
}

/** The commands the menu shows, for tests and the palette's consistency check. */
export function menuCommands(commands: readonly ShellCommand[] = COMMANDS): ShellCommand[] {
  return commands.filter((command) => command.menu !== undefined);
}

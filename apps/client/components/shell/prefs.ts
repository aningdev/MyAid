import fs from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";

/**
 * The shell's client preferences: the Navigator's width and folded sections,
 * the Workbench's layout and the panel addresses in it, and the pinned
 * addresses in Favorites. Kept under the data root (`~/.myaid/prefs`) on the
 * desktop and in the app's storage on the web, so a launch opens where the
 * person left it. A missing object degrades to an empty Panel.
 */
import { platform, signal } from "nsh";
import { Storage } from "nsh";
import type { DockAreaLayout, DockNode } from "nsh/base";

import { claimOwner, type BotRegistry, type Dialogue } from "../../features/bots/model";
import { favorites, setFavorites } from "./favorites";
import { NAV_DEFAULT_EXPANDED } from "./fixtures";
import {
  NAV_DEFAULT_WIDTH,
  NAV_MAX_WIDTH,
  NAV_MIN_WIDTH,
  expandedSections,
  navOpen,
  navWidth,
  setExpandedSections,
  setNavOpen,
  setNavWidth,
} from "./layout";
import { botAddress, dialogueAddress, dialogueLabels, sessionAddress } from "./navAddresses";
import { activePanelId, applyWorkbench, dockLayout, panelContents } from "./state";
import type { NavAddress, PanelContents } from "./types";

export const SHELL_PREFS_VERSION = 1 as const;
export const SHELL_PREFS_STORAGE = "myaid.prefs.shell";

export type ShellPrefs = {
  version: typeof SHELL_PREFS_VERSION;
  nav: {
    width: number;
    open: boolean;
    expanded: string[];
  };
  /** Pinned Navigator addresses, in the person's order. */
  favorites: NavAddress[];
  workbench: {
    layout: DockAreaLayout;
    contents: PanelContents;
    activePanelId: string;
  };
};

/** `~/.myaid/prefs/client.json`. */
export function defaultPrefsPath(): string {
  return join(homedir(), ".myaid", "prefs", "client.json");
}

export function emptyShellPrefs(): ShellPrefs {
  return {
    version: SHELL_PREFS_VERSION,
    nav: {
      width: NAV_DEFAULT_WIDTH,
      open: true,
      expanded: [...NAV_DEFAULT_EXPANDED],
    },
    favorites: [],
    workbench: {
      layout: emptyLayout("panel-1"),
      contents: { "panel-1": null },
      activePanelId: "panel-1",
    },
  };
}

/** The shell's state now, in the shape written to disk. */
export function collectShellPrefs(): ShellPrefs {
  return {
    version: SHELL_PREFS_VERSION,
    nav: {
      width: clampWidth(navWidth()),
      open: navOpen(),
      expanded: [...expandedSections()],
    },
    favorites: favorites().map((address) => ({ ...address })),
    workbench: {
      layout: dockLayout(),
      contents: Object.fromEntries(
        Object.entries(panelContents()).map(([panel, address]) => [
          panel,
          address ? { ...address } : null,
        ]),
      ),
      activePanelId: activePanelId(),
    },
  };
}

/**
 * Apply stored preferences. Addresses are resolved against the registry that
 * just loaded: a Bot, Dialogue or Session that is gone leaves its Panel empty.
 */
export function applyShellPrefs(prefs: ShellPrefs, registry: BotRegistry): void {
  setNavWidth(clampWidth(prefs.nav.width));
  setNavOpen(prefs.nav.open);
  // An empty list is a real state (every section folded), not a missing one.
  setExpandedSections(prefs.nav.expanded.filter((id) => typeof id === "string"));
  setFavorites(
    prefs.favorites
      .map((address) => resolveAddress(address, registry))
      .filter((address): address is NavAddress => address !== null),
  );
  const restored = restoreWorkbenchSnapshot(prefs.workbench, (address) =>
    resolveAddress(address, registry),
  );
  applyWorkbench(restored.layout, restored.contents, restored.activePanelId);
}

/**
 * A stored address against the registry as it is now: current titles, or
 * null when the object is gone (a deleted Bot, an archived Dialogue or
 * Session). This is what makes old preferences safe to open.
 */
export function resolveAddress(address: NavAddress, registry: BotRegistry): NavAddress | null {
  switch (address.kind) {
    case "bot": {
      const bot = registry.bots.find((item) => item.id === address.botId);
      return bot ? botAddress(bot) : null;
    }
    case "dialogue": {
      const dialogue = registry.dialogues.find((item) => item.id === address.dialogueId);
      if (!dialogue || dialogue.archived) return null;
      const bot = registry.bots.find((item) => item.id === dialogue.botId);
      if (!bot) return null;
      return dialogueAddress({
        id: dialogue.id,
        workspacePath: dialogue.workspacePath,
        botId: bot.id,
        botName: bot.name,
        label: dialogueLabelOf(dialogue, registry, bot.name),
      });
    }
    case "session": {
      const owner = address.sessionId ? claimOwner(registry, address.sessionId) : null;
      if (!owner || owner.claim.archived || owner.dialogue.archived) return null;
      return sessionAddress({
        sessionId: owner.claim.sessionId,
        label: owner.claim.title ?? address.title ?? "Session",
        botId: owner.bot.id,
        dialogueId: owner.dialogue.id,
      });
    }
    default:
      return null;
  }
}

function dialogueLabelOf(dialogue: Dialogue, registry: BotRegistry, botName: string): string {
  const names = dialogueLabels({
    dialogues: registry.dialogues.filter((item) => !item.archived),
    botName: (id) => registry.bots.find((bot) => bot.id === id)?.name ?? "",
  });
  return names.get(dialogue.id)?.full ?? botName;
}

/** Parse stored text; anything unreadable is the defaults, never a throw. */
export function parseShellPrefs(text: string | null): ShellPrefs {
  if (!text) return emptyShellPrefs();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return emptyShellPrefs();
  }
  if (!isRecord(value)) return emptyShellPrefs();
  // A future file keeps what this version knows; an older one has no fields.
  const nav = isRecord(value.nav) ? value.nav : {};
  const workbench = isRecord(value.workbench) ? value.workbench : {};
  const layout = sanitizeLayout(workbench.layout);
  const active = typeof workbench.activePanelId === "string" ? workbench.activePanelId : "";
  const contents = sanitizeContents(workbench.contents, layout, active);
  return {
    version: SHELL_PREFS_VERSION,
    nav: {
      width: clampWidth(typeof nav.width === "number" ? nav.width : NAV_DEFAULT_WIDTH),
      open: typeof nav.open === "boolean" ? nav.open : true,
      expanded: Array.isArray(nav.expanded)
        ? nav.expanded.filter((id): id is string => typeof id === "string")
        : [...NAV_DEFAULT_EXPANDED],
    },
    favorites: Array.isArray(value.favorites)
      ? value.favorites
          .map(parseAddress)
          .filter((address): address is NavAddress => address !== null)
      : [],
    workbench: {
      layout,
      contents,
      activePanelId:
        active && collectPanelIds(layout.center).includes(active)
          ? active
          : (collectPanelIds(layout.center)[0] ?? "panel-1"),
    },
  };
}

/** The restore itself: a workbench whose missing addresses are empty Panels. */
export function restoreWorkbenchSnapshot(
  stored: {
    layout: DockAreaLayout;
    contents: PanelContents;
    activePanelId: string;
  },
  resolve: (address: NavAddress) => NavAddress | null,
): { layout: DockAreaLayout; contents: PanelContents; activePanelId: string } {
  const layout = sanitizeLayout(stored.layout);
  const ids = collectPanelIds(layout.center);
  const contents: PanelContents = {};
  for (const id of ids) {
    const address = stored.contents?.[id] ?? null;
    contents[id] = address ? resolve(address) : null;
  }
  const active = ids.includes(stored.activePanelId) ? stored.activePanelId : (ids[0] ?? "panel-1");
  return { layout, contents, activePanelId: active };
}

export function serializeShellPrefs(prefs: ShellPrefs): string {
  return `${JSON.stringify(prefs, null, 2)}\n`;
}

/** The app's storage read once at the shell's start. */
interface PrefsStore {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export function prefsStore(): PrefsStore {
  if (platform.os === "macos" || platform.os === "windows" || platform.os === "linux") {
    const path = defaultPrefsPath();
    return {
      async read() {
        try {
          return await fs.readFile(path, "utf8");
        } catch (error) {
          if (errorCode(error) === "ENOENT") return null;
          throw error;
        }
      },
      async write(text) {
        await fs.mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await fs.writeFile(temporary, text);
        await fs.rename(temporary, path);
      },
    };
  }
  return {
    read: () => Storage.getItem(SHELL_PREFS_STORAGE),
    write: (text) => Storage.setItem(SHELL_PREFS_STORAGE, text),
  };
}

let store: PrefsStore | undefined;
const loaded = signal(false);

/** True once the launch read the stored preferences (writes wait for it). */
export function prefsLoaded(): boolean {
  return loaded();
}

/** Read what the last launch left; a failure is the defaults, not a crash. */
export async function loadShellPrefs(): Promise<ShellPrefs> {
  if (!store) store = prefsStore();
  try {
    return parseShellPrefs(await store.read());
  } catch {
    return emptyShellPrefs();
  }
}

let pending: ShellPrefs | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Record that the launch applied the stored preferences; writes may start. */
export function markPrefsLoaded(): void {
  loaded.set(true);
}

/** Queue a write; a burst of resizes and folds lands as one file write. */
export function saveShellPrefs(prefs: ShellPrefs): void {
  pending = prefs;
  if (timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    const next = pending;
    pending = null;
    if (!next) return;
    if (!store) store = prefsStore();
    void store.write(serializeShellPrefs(next)).catch(() => undefined);
  }, 400);
}

/** The launch's prefs read, and the shell's start once the registry is read. */
export async function loadAndApplyShellPrefs(registry: BotRegistry): Promise<void> {
  const prefs = await loadShellPrefs();
  applyShellPrefs(prefs, registry);
  markPrefsLoaded();
}

// --- pure shapes -----------------------------------------------------------

function emptyLayout(panelId: string): DockAreaLayout {
  return {
    center: { type: "tabs", panels: [panelId], activeIndex: 0 },
  };
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return NAV_DEFAULT_WIDTH;
  return Math.round(Math.min(NAV_MAX_WIDTH, Math.max(NAV_MIN_WIDTH, width)));
}

function sanitizeLayout(value: unknown): DockAreaLayout {
  // Stored as a DockAreaLayout (`{ center }`), read as its center node.
  const center = parseNode(isRecord(value) && "center" in value ? value.center : value);
  return center ? { center } : emptyLayout("panel-1");
}

function parseNode(value: unknown): DockNode | null {
  if (!isRecord(value)) return null;
  if (value.type === "tabs") {
    if (!Array.isArray(value.panels)) return null;
    const panels = value.panels.filter(
      (panel): panel is string => typeof panel === "string" && panel.length > 0,
    );
    if (panels.length === 0 || panels.length !== value.panels.length) return null;
    const activeIndex =
      typeof value.activeIndex === "number" &&
      Number.isInteger(value.activeIndex) &&
      value.activeIndex >= 0 &&
      value.activeIndex < panels.length
        ? value.activeIndex
        : 0;
    return { type: "tabs", panels, activeIndex };
  }
  if (value.type === "split") {
    const axis = value.axis === "horizontal" || value.axis === "vertical" ? value.axis : null;
    if (!axis || !Array.isArray(value.children)) return null;
    const children = value.children.map(parseNode);
    if (children.length === 0 || children.some((child) => child === null)) return null;
    const nodeChildren = children as DockNode[];
    const sizes =
      Array.isArray(value.sizes) && value.sizes.length === nodeChildren.length
        ? value.sizes.map((size) =>
            typeof size === "number" && Number.isFinite(size) ? size : null,
          )
        : nodeChildren.map(() => null);
    return { type: "split", axis, children: nodeChildren, sizes };
  }
  return null;
}

function sanitizeContents(
  value: unknown,
  layout: DockAreaLayout,
  activePanelId: string,
): PanelContents {
  const ids = collectPanelIds(layout.center);
  const record = isRecord(value) ? value : {};
  const contents: PanelContents = {};
  for (const id of ids) {
    contents[id] = parseAddress(record[id]);
  }
  const active = ids.includes(activePanelId) ? activePanelId : (ids[0] ?? "panel-1");
  return { ...contents, [active]: contents[active] ?? null };
}

function parseAddress(value: unknown): NavAddress | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const title = typeof value.title === "string" ? value.title : "";
  const kind = value.kind;
  if (!id || !title) return null;
  if (kind !== "bot" && kind !== "dialogue" && kind !== "session") return null;
  const root =
    value.root === "bots" || value.root === "dialogues" || value.root === "favorites"
      ? value.root
      : kind === "bot"
        ? "bots"
        : "dialogues";
  const path = Array.isArray(value.path)
    ? value.path.filter((part): part is string => typeof part === "string")
    : [title];
  return {
    id,
    root,
    path: path.length > 0 ? path : [title],
    title,
    kind,
    ...(typeof value.botId === "string" ? { botId: value.botId } : {}),
    ...(typeof value.dialogueId === "string" ? { dialogueId: value.dialogueId } : {}),
    ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}),
  };
}

function collectPanelIds(node: DockNode): string[] {
  if (node.type === "tabs") return [...node.panels];
  return node.children.flatMap(collectPanelIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

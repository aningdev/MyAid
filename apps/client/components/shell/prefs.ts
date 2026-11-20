import fs from "fs/promises";
import { dirname } from "path";

/**
 * The shell's client preferences: the Navigator's width and open state, the
 * pinned Bots, the Workbench's Panes (layout, the Bot each shows, the one
 * with the focus), and the General page's appearance, language and colour.
 * Kept under
 * the data root (`~/.dsh-bot/prefs`) on the desktop and in the app's storage on
 * the web, so a launch opens where the person left it. A Bot that is gone
 * leaves its Pane empty.
 *
 * Version 1 kept Favorites: the old addresses are read once — a Bot pin is
 * kept, a Dialogue or Session pin becomes the Pane of the Bot it belonged to,
 * and the session pins themselves are dropped (a Session is a segment now).
 * `appearance` joined the same version as an optional section, so a file
 * written before it reads as the defaults; `theme` joined the section the same
 * way, `null` being the theme the app was built with.
 */
import { signal } from "nsh";
import { Storage } from "nsh";

import type { BotRegistry } from "../../features/bots/model";
import {
  APPEARANCE_SCHEMES,
  applyScheme,
  appearanceScheme,
  type AppearanceScheme,
} from "../../lib/appearance";
import { prefsPath, usesDataRootFiles } from "../../lib/data-root";
import { LANGUAGES, languagePref, setLanguagePref, type LanguagePref } from "../../lib/i18n";
import { THEMES, applyTheme, themePref, type ThemeId } from "../../lib/themes";
import type { DockAreaLayout, DockNode } from "../ui/dock-area";
import {
  NAV_DEFAULT_WIDTH,
  NAV_MAX_WIDTH,
  NAV_MIN_WIDTH,
  navOpen,
  navWidth,
  setNavOpen,
  setNavWidth,
} from "./layout";
import { pins, setPins } from "./pins";
import { activePanelId, applyWorkbench, dockLayout, panelContents } from "./state";
import type { PanelContents } from "./types";

export const SHELL_PREFS_VERSION = 2 as const;
export const SHELL_PREFS_STORAGE = "dsh-bot.prefs.shell";

export type ShellPrefs = {
  version: typeof SHELL_PREFS_VERSION;
  nav: {
    width: number;
    open: boolean;
  };
  /** Pinned Bot ids, in the person's order. */
  pins: string[];
  /** The General page's appearance, language and colour, never dsh's settings. */
  appearance: {
    scheme: AppearanceScheme;
    language: LanguagePref;
    /** The theme in use: an `AppTheme`'s id, `null` for the app's build-time one. */
    theme: ThemeId;
  };
  workbench: {
    layout: DockAreaLayout;
    contents: PanelContents;
    activePanelId: string;
  };
};

/** `~/.dsh-bot/prefs/client.json`. */
export function defaultPrefsPath(): string {
  return prefsPath();
}

export function emptyShellPrefs(): ShellPrefs {
  return {
    version: SHELL_PREFS_VERSION,
    nav: { width: NAV_DEFAULT_WIDTH, open: true },
    pins: [],
    appearance: { scheme: "system", language: "system", theme: null },
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
    },
    pins: [...pins()],
    appearance: { scheme: appearanceScheme(), language: languagePref(), theme: themePref() },
    workbench: {
      layout: dockLayout(),
      contents: Object.fromEntries(
        Object.entries(panelContents()).map(([panel, content]) => [
          panel,
          content ? { botId: content.botId } : null,
        ]),
      ),
      activePanelId: activePanelId(),
    },
  };
}

/**
 * Apply stored preferences. Panes are resolved against the registry as it is
 * now: a Bot that is gone leaves its Pane empty, a pinned id that no longer
 * exists leaves the pins.
 */
export function applyShellPrefs(prefs: ShellPrefs, registry: BotRegistry): void {
  setNavWidth(clampWidth(prefs.nav.width));
  setNavOpen(prefs.nav.open);
  applyScheme(prefs.appearance.scheme);
  setLanguagePref(prefs.appearance.language);
  applyTheme(prefs.appearance.theme);
  const known = new Set(registry.bots.map((bot) => bot.id));
  setPins(prefs.pins.filter((id) => known.has(id)));
  const restored = restoreWorkbenchSnapshot(prefs.workbench, (botId) =>
    known.has(botId) ? botId : null,
  );
  applyWorkbench(restored.layout, restored.contents, restored.activePanelId);
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
  const nav = isRecord(value.nav) ? value.nav : {};
  const workbench = isRecord(value.workbench) ? value.workbench : {};
  const layout = sanitizeLayout(workbench.layout);
  const active = typeof workbench.activePanelId === "string" ? workbench.activePanelId : "";
  const older = value.version === 1;
  return {
    version: SHELL_PREFS_VERSION,
    nav: {
      width: clampWidth(typeof nav.width === "number" ? nav.width : NAV_DEFAULT_WIDTH),
      open: typeof nav.open === "boolean" ? nav.open : true,
    },
    pins: older ? pinsFromFavorites(value.favorites) : parsePins(value.pins),
    appearance: parseAppearance(value.appearance),
    workbench: {
      layout,
      contents: older
        ? contentsFromAddresses(workbench.contents, layout, active)
        : sanitizeContents(workbench.contents, layout, active),
      activePanelId:
        active && collectPanelIds(layout.center).includes(active)
          ? active
          : (collectPanelIds(layout.center)[0] ?? "panel-1"),
    },
  };
}

/** The restore itself: a Workbench whose vanished Bots are empty Panes. */
export function restoreWorkbenchSnapshot(
  stored: {
    layout: DockAreaLayout;
    contents: PanelContents;
    activePanelId: string;
  },
  resolve: (botId: string) => string | null,
): { layout: DockAreaLayout; contents: PanelContents; activePanelId: string } {
  const layout = sanitizeLayout(stored.layout);
  const ids = collectPanelIds(layout.center);
  const contents: PanelContents = {};
  for (const id of ids) {
    const botId = stored.contents?.[id]?.botId ?? null;
    const resolved = botId ? resolve(botId) : null;
    contents[id] = resolved ? { botId: resolved } : null;
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
  if (usesDataRootFiles()) {
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

/** Queue a write; a burst of resizes and splits lands as one file write. */
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
    contents[id] = parseContent(record[id]);
  }
  const active = ids.includes(activePanelId) ? activePanelId : (ids[0] ?? "panel-1");
  return { ...contents, [active]: contents[active] ?? null };
}

function parseContent(value: unknown): { botId: string } | null {
  if (!isRecord(value)) return null;
  const botId = typeof value.botId === "string" ? value.botId : "";
  return botId ? { botId } : null;
}

/** Pins read from a version 2 file: Bot ids, in order, without duplicates. */
function parsePins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * The appearance section, or the defaults: a file written before the section
 * existed, or a value this build does not offer, keeps the default rather
 * than putting the palette in a state no control can leave. A file written
 * when the client still had an accent colour keeps loading: the field is
 * ignored. The colour is the id of a theme this build carries; anything else
 * (an id from a build with other themes, or no id at all) is the build-time
 * theme.
 */
function parseAppearance(value: unknown): ShellPrefs["appearance"] {
  const record = isRecord(value) ? value : {};
  const scheme = APPEARANCE_SCHEMES.some((entry) => entry.id === record.scheme)
    ? (record.scheme as AppearanceScheme)
    : "system";
  const language = LANGUAGES.some((entry) => entry.id === record.language)
    ? (record.language as LanguagePref)
    : "system";
  const theme =
    typeof record.theme === "string" && THEMES.some((entry) => entry.id === record.theme)
      ? record.theme
      : null;
  return { scheme, language, theme };
}

/**
 * Version 1's Favorites: a Bot pin is kept; a Dialogue or Session pin was a
 * place of that Bot, which is the Pane it opens now. The Session pins
 * themselves are dropped.
 */
function pinsFromFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const address of value) {
    if (!isRecord(address) || address.kind !== "bot") continue;
    const botId = typeof address.botId === "string" ? address.botId : "";
    if (botId && !out.includes(botId)) out.push(botId);
  }
  return out;
}

/** Version 1's Panes held addresses; each names the Bot whose Pane it is. */
function contentsFromAddresses(
  value: unknown,
  layout: DockAreaLayout,
  activePanelId: string,
): PanelContents {
  const ids = collectPanelIds(layout.center);
  const record = isRecord(value) ? value : {};
  const contents: PanelContents = {};
  for (const id of ids) {
    const address = record[id];
    const botId = isRecord(address) && typeof address.botId === "string" ? address.botId : "";
    contents[id] = botId ? { botId } : null;
  }
  const active = ids.includes(activePanelId) ? activePanelId : (ids[0] ?? "panel-1");
  return { ...contents, [active]: contents[active] ?? null };
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

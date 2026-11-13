/**
 * The Navigator's sections, projected from the desktop registry
 * (`Bot → Dialogue → claimed Session`), the session roster's titles and the
 * person's pinned addresses. One pure function, so the tree and its address
 * map are testable; `Navigator` only draws what this gives it.
 *
 * A v3 / v4 registry that is waiting for its migration is drawn from its own
 * fields, read-only: rows show the Bot and the Dialogue's path, carry no
 * address and open nothing. That is the only place the old fields are read.
 */
import { computed } from "nsh";
import type { TreeItem } from "nsh/base";

import type {
  Bot,
  BotRegistry,
  Dialogue,
  LegacyRegistry,
  SessionClaim,
} from "../../features/bots/model";
import { sessionLabel } from "../../features/bots/sessions";
import { legacyRegistry, registry } from "../../features/bots/state";
import { sessionList, type SessionRow } from "../../features/dialogue/session/runtime";
import { pathSegment } from "../../features/workspace/paths";
import {
  isDialogueArchived,
  orderedClaims,
  orderedDialogues,
  pinnedClaims,
  workspacePath,
  workspaceTitle,
  workspaces,
  type WorkspaceProjection,
} from "../../features/workspace/state";
import { favorites } from "./favorites";
import { PARKED_NAV, parkedActionForId } from "./fixtures";
import {
  backgroundSettingsAddress,
  botAddress,
  dialogueAddress,
  dialogueLabels,
  sessionAddress,
} from "./navAddresses";
import { navQuery } from "./navFilter";
import type { NavAction, NavAddress } from "./types";

/** The tree plus the action each of its item ids carries. */
export type NavProjection = {
  items: TreeItem[];
  actions: Map<string, NavAction>;
  /** Addresses by their id, for panels and titles that only know the id. */
  addresses: Map<string, NavAddress>;
  /** Row decoration by item id, aggregated from the Sessions under it. */
  statuses: Map<string, NavStatus>;
};

/** What a tree row shows about the Sessions under it (a projection, not a second model). */
export type NavStatus = {
  working: boolean;
  unread: boolean;
  attention: boolean;
};

const EMPTY_STATUS: NavStatus = { working: false, unread: false, attention: false };

function mergeStatus(into: Map<string, NavStatus>, itemId: string, status: NavStatus): void {
  if (!status.working && !status.unread && !status.attention) return;
  const current = into.get(itemId) ?? EMPTY_STATUS;
  into.set(itemId, {
    working: current.working || status.working,
    unread: current.unread || status.unread,
    attention: current.attention || status.attention,
  });
}

export type NavInput = {
  registry: BotRegistry;
  /** dsh's Workspace rows: Dialogue names, paths, Session order and pins. */
  workspaces: WorkspaceProjection;
  /** A v3 / v4 file waiting for its Host migration: read-only rows. */
  legacy?: LegacyRegistry | null;
  /** Live roster rows: their labels are the newest session titles. */
  rows: readonly SessionRow[];
  /** Pinned addresses (Favorites), already in the person's order. */
  favorites?: readonly NavAddress[];
  /** The sidebar filter: a case-insensitive substring of titles, names and paths. */
  query?: string;
};

/** The tree item id of the new-Bot draft (a leaf under an empty Bots section). */
export const NEW_BOT_ITEM_ID = "bots:new";

/** The collapsed group that holds Dialogues whose Sessions are all archived. */
export const ARCHIVED_DIALOGUES_ITEM_ID = "dialogues:archived";

/** One section's header (children only; the section itself is not an address). */
function section(id: string, label: string, children: TreeItem[]): TreeItem {
  return { id, label, children };
}

function normalizeQuery(query: string | undefined): string {
  return (query ?? "").trim().toLocaleLowerCase();
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  return !!haystack && haystack.toLocaleLowerCase().includes(needle);
}

/** The tree for the registry as it is now. */
export function projectNav(input: NavInput): NavProjection {
  return input.legacy ? projectLegacy(input, input.legacy) : projectRegistry(input);
}

function projectRegistry(input: NavInput): NavProjection {
  const actions = new Map<string, NavAction>();
  const addresses = new Map<string, NavAddress>();
  const statuses = new Map<string, NavStatus>();
  const query = normalizeQuery(input.query);

  const addressAction = (itemId: string, address: NavAddress): NavAction => {
    actions.set(itemId, { type: "address", address });
    addresses.set(address.id, address);
    return { type: "address", address };
  };

  const labels = new Map(input.rows.map((row) => [row.id, row.label]));
  const rows = new Map(input.rows.map((row) => [row.id, row]));
  const botById = new Map(input.registry.bots.map((bot) => [bot.id, bot]));
  const botName = (id: string) => botById.get(id)?.name ?? "";
  const labelOf = (claim: SessionClaim) => labels.get(claim.sessionId) ?? sessionLabel(claim, null);
  const statusOf = (sessionId: string): NavStatus => {
    const row = rows.get(sessionId);
    return row
      ? { working: row.running, unread: row.unread, attention: row.attention }
      : EMPTY_STATUS;
  };
  const titleOf = (dialogue: Dialogue) => workspaceTitle(input.workspaces, dialogue);
  const pathOf = (dialogue: Dialogue) => workspacePath(input.workspaces, dialogue);
  const claimsOf = (dialogue: Dialogue) =>
    orderedClaims(input.workspaces, dialogue, dialogue.claims);
  const claimMatches = (claim: SessionClaim, dialogue: Dialogue): boolean => {
    const label = labelOf(claim);
    return (
      contains(label, query) ||
      contains(botName(dialogue.botId), query) ||
      contains(pathOf(dialogue), query) ||
      contains(titleOf(dialogue), query)
    );
  };
  const dialogueMatches = (dialogue: Dialogue): boolean =>
    contains(titleOf(dialogue), query) ||
    contains(pathOf(dialogue), query) ||
    contains(botName(dialogue.botId), query) ||
    dialogue.claims.some((claim) => claimMatches(claim, dialogue));
  const botMatches = (bot: Bot, dialogues: readonly Dialogue[]): boolean =>
    contains(bot.name, query) ||
    contains(bot.description, query) ||
    dialogues.some((dialogue) => dialogueMatches(dialogue));

  const sessionLeaves = (
    itemPrefix: string,
    dialogue: Dialogue,
    ancestors: string[],
    include: (claim: SessionClaim) => boolean,
  ): TreeItem[] =>
    // dsh's Workspace order, minus the Sessions dsh archived.
    claimsOf(dialogue)
      .filter(include)
      .map((claim) => {
        const label = labelOf(claim);
        const address = sessionAddress({
          sessionId: claim.sessionId,
          label,
          botId: dialogue.botId,
          dialogueId: dialogue.id,
        });
        const itemId = `${itemPrefix}/${claim.sessionId}`;
        addressAction(itemId, address);
        const status = statusOf(claim.sessionId);
        mergeStatus(statuses, itemId, status);
        for (const ancestor of ancestors) mergeStatus(statuses, ancestor, status);
        return { id: itemId, label };
      });

  // Dialogues follow dsh's Workspace order; their Sessions that Workspace's
  // manual order. Two Dialogues on one title read apart ("myaid", "myaid · 2").
  const ordered = orderedDialogues(input.workspaces, input.registry.dialogues);
  const active = ordered.filter((dialogue) => !isDialogueArchived(input.workspaces, dialogue));
  const archived = ordered.filter((dialogue) => isDialogueArchived(input.workspaces, dialogue));
  const dialogueNames = dialogueLabels({
    dialogues: ordered.map((dialogue) => ({
      id: dialogue.id,
      botId: dialogue.botId,
      title: titleOf(dialogue),
    })),
    botName,
  });
  const dialogueAddressOf = (dialogue: Dialogue): NavAddress => {
    const names = dialogueNames.get(dialogue.id);
    return dialogueAddress({
      id: dialogue.id,
      title: titleOf(dialogue),
      botId: dialogue.botId,
      botName: botName(dialogue.botId),
      ...(names ? { label: names.full } : {}),
    });
  };

  /** An empty Bots section still offers the way in: the new-Bot sheet. */
  const newBotLeaf = (): TreeItem => {
    actions.set(NEW_BOT_ITEM_ID, { type: "newBot" });
    return { id: NEW_BOT_ITEM_ID, label: "New Bot" };
  };

  const botSection = (): TreeItem => {
    const leaves = input.registry.bots
      .map((bot) => {
        const dialogues = active.filter((dialogue) => dialogue.botId === bot.id);
        const botHit = botMatches(bot, dialogues);
        const children = dialogues
          .filter((dialogue) => !query || botHit || dialogueMatches(dialogue))
          .map((dialogue) => {
            const names = dialogueNames.get(dialogue.id);
            addressAction(`bots:${bot.id}/${dialogue.id}`, dialogueAddressOf(dialogue));
            // A Bot that matched shows all its Sessions; a Dialogue that
            // matched on one Session still shows the others beside it.
            const include = (claim: SessionClaim) =>
              !query || botHit || dialogueMatches(dialogue) || claimMatches(claim, dialogue);
            return {
              id: `bots:${bot.id}/${dialogue.id}`,
              label: names?.segment ?? titleOf(dialogue),
              children: sessionLeaves(
                `bots:${bot.id}/${dialogue.id}`,
                dialogue,
                [`bots:${bot.id}/${dialogue.id}`, `bots:${bot.id}`],
                include,
              ),
            };
          });
        return { bot, children };
      })
      .filter(({ bot, children }) => {
        if (!query) return true;
        const own = active.filter((dialogue) => dialogue.botId === bot.id);
        return botMatches(bot, own) || children.length > 0;
      });

    if (leaves.length === 0) {
      return section(
        "root:bots",
        "Bots",
        input.registry.bots.length === 0 && !query ? [newBotLeaf()] : [],
      );
    }
    return section(
      "root:bots",
      "Bots",
      leaves.map(({ bot, children }) => {
        addressAction(`bots:${bot.id}`, botAddress(bot));
        return { id: `bots:${bot.id}`, label: bot.name, children };
      }),
    );
  };

  const dialogueRow = (dialogue: Dialogue, itemId: string): TreeItem => {
    const address = dialogueAddressOf(dialogue);
    addressAction(itemId, address);
    return {
      id: itemId,
      label: address.title,
      children: sessionLeaves(
        itemId,
        dialogue,
        [itemId],
        (claim) => !query || dialogueMatches(dialogue) || claimMatches(claim, dialogue),
      ),
    };
  };

  const dialogueSection = (): TreeItem => {
    const shown = active.filter((dialogue) => !query || dialogueMatches(dialogue));
    const rows = shown.map((dialogue) => dialogueRow(dialogue, `dialogues:${dialogue.id}`));
    const archivedShown = query
      ? archived.filter((dialogue) => dialogueMatches(dialogue))
      : archived;
    if (archivedShown.length > 0) {
      // A Dialogue whose Sessions are all archived leaves the active list but
      // stays reachable here; dsh has no Dialogue-level archive flag.
      rows.push({
        id: ARCHIVED_DIALOGUES_ITEM_ID,
        label: "已归档",
        children: archivedShown.map((dialogue) =>
          dialogueRow(dialogue, `dialogues:${dialogue.id}`),
        ),
      });
    }
    return section("root:dialogues", "Dialogues", rows);
  };

  const botTree = botSection();
  const dialogueTree = dialogueSection();

  // Favorites: the Sessions pinned in dsh come first (its pin order), then the
  // addresses a person pinned in client prefs. Both read live addresses, so a
  // renamed Bot or title shows current.
  const favoriteRows: TreeItem[] = [];
  const seenFavorite = new Set<string>();
  for (const dialogue of ordered) {
    for (const claim of pinnedClaims(input.workspaces, dialogue.claims)) {
      const address = addresses.get(`session:${claim.sessionId}`);
      if (!address || seenFavorite.has(address.id)) continue;
      if (query && !contains(address.title, query)) continue;
      seenFavorite.add(address.id);
      addressAction(`fav:${address.id}`, address);
      favoriteRows.push({ id: `fav:${address.id}`, label: address.title });
    }
  }
  for (const pin of input.favorites ?? []) {
    const live = addresses.get(pin.id);
    if (!live || seenFavorite.has(live.id)) continue;
    if (query && !contains(live.title, query)) continue;
    seenFavorite.add(live.id);
    addressAction(`fav:${live.id}`, live);
    favoriteRows.push({ id: `fav:${live.id}`, label: live.title });
  }

  return assemble({ actions, addresses, statuses, query, favoriteRows, botTree, dialogueTree });
}

/**
 * A v3 / v4 file, read-only: the same Bots and Dialogues with their own path
 * as the label. Rows carry no address, so a press only folds them open; the
 * migration notice explains why nothing can be opened or written.
 */
function projectLegacy(input: NavInput, legacy: LegacyRegistry): NavProjection {
  const actions = new Map<string, NavAction>();
  const addresses = new Map<string, NavAddress>();
  const statuses = new Map<string, NavStatus>();
  const query = normalizeQuery(input.query);
  const botName = (id: string) => legacy.bots.find((bot) => bot.id === id)?.name ?? "";
  const visible = legacy.dialogues.filter((dialogue) => !dialogue.archived);

  const sessionLeaves = (itemPrefix: string, dialogueId: string): TreeItem[] => {
    const dialogue = legacy.dialogues.find((item) => item.id === dialogueId);
    if (!dialogue) return [];
    return dialogue.claims
      .filter((claim) => !claim.archived)
      .map((claim) => ({
        id: `${itemPrefix}/s/${claim.sessionId}`,
        label: sessionLabel({ title: claim.title }, null),
      }));
  };

  const botTree = section(
    "root:bots",
    "Bots",
    legacy.bots
      .filter((bot) => !query || matchesBot(bot, visible, query))
      .map((bot) => ({
        id: `legacy:bot:${bot.id}`,
        label: bot.name,
        children: visible
          .filter((dialogue) => dialogue.botId === bot.id)
          .filter((dialogue) => !query || matchesLegacy(dialogue, bot.name, query))
          .map((dialogue) => {
            const itemId = `legacy:bot:${bot.id}/dlg/${dialogue.id}`;
            return {
              id: itemId,
              label: pathSegment(dialogue.workspacePath),
              children: sessionLeaves(itemId, dialogue.id),
            };
          }),
      })),
  );

  const dialogueTree = section(
    "root:dialogues",
    "Dialogues",
    visible
      .filter((dialogue) => !query || matchesLegacy(dialogue, botName(dialogue.botId), query))
      .map((dialogue) => {
        const itemId = `legacy:dlg/${dialogue.id}`;
        return {
          id: itemId,
          label: `${botName(dialogue.botId)} · ${pathSegment(dialogue.workspacePath)}`,
          children: sessionLeaves(itemId, dialogue.id),
        };
      }),
  );

  return assemble({
    actions,
    addresses,
    statuses,
    query,
    favoriteRows: [],
    botTree,
    dialogueTree,
  });
}

function matchesLegacy(
  dialogue: LegacyRegistry["dialogues"][number],
  botName: string,
  query: string,
): boolean {
  return (
    contains(pathSegment(dialogue.workspacePath), query) ||
    contains(dialogue.workspacePath, query) ||
    contains(dialogue.name, query) ||
    contains(botName, query) ||
    dialogue.claims.some((claim) => contains(claim.title, query))
  );
}

function matchesBot(
  bot: { name: string; id: string },
  dialogues: LegacyRegistry["dialogues"],
  query: string,
): boolean {
  if (contains(bot.name, query)) return true;
  return dialogues.some(
    (dialogue) => dialogue.botId === bot.id && matchesLegacy(dialogue, bot.name, query),
  );
}

/** Sections in their fixed order: Favorites, parked, Bots, Dialogues, Spaces, Settings. */
function assemble(input: {
  actions: Map<string, NavAction>;
  addresses: Map<string, NavAddress>;
  statuses: Map<string, NavStatus>;
  query: string;
  favoriteRows: TreeItem[];
  botTree: TreeItem;
  dialogueTree: TreeItem;
}): NavProjection {
  const { actions, addresses, query } = input;
  /** Settings' leaf is real: it opens the Background Services Panel. */
  const settingsSection = (): TreeItem | null => {
    const address = backgroundSettingsAddress();
    if (query && !contains(address.title, query)) return null;
    const itemId = "settings:background";
    actions.set(itemId, { type: "address", address });
    addresses.set(address.id, address);
    return section("root:settings", "Settings", [{ id: itemId, label: address.title }]);
  };

  // Parked sections keep their fixtures' actions (Spaces apply, others open).
  // A search is about the product's own objects: the parked sections hide.
  const parked = (root: keyof typeof PARKED_NAV): TreeItem => {
    const walk = (item: TreeItem) => {
      const action = parkedActionForId(item.id);
      if (action) {
        actions.set(item.id, action);
        if (action.type === "address") addresses.set(action.address.id, action.address);
      }
      item.children?.forEach(walk);
    };
    walk(PARKED_NAV[root]);
    return PARKED_NAV[root];
  };

  const settingsTree = settingsSection();
  const items: TreeItem[] = query
    ? [
        section("root:favorites", "Favorites", input.favoriteRows),
        input.botTree,
        input.dialogueTree,
        ...(settingsTree ? [settingsTree] : []),
      ]
    : [
        section("root:favorites", "Favorites", input.favoriteRows),
        parked("mail"),
        parked("task"),
        parked("knowledge"),
        input.botTree,
        input.dialogueTree,
        parked("spaces"),
        ...(settingsTree ? [settingsTree] : []),
      ];

  return {
    items,
    actions,
    addresses,
    statuses: input.statuses,
  };
}

const projection = computed(() =>
  projectNav({
    registry: registry(),
    workspaces: workspaces(),
    legacy: legacyRegistry(),
    rows: sessionList(),
    favorites: favorites(),
    query: navQuery(),
  }),
);

/** The whole Navigator tree, as the shell roots stand now. */
export function navItems(): TreeItem[] {
  return projection().items;
}

/** What pressing the tree item of `id` does. */
export function navActionForId(id: string): NavAction | undefined {
  return projection().actions.get(id);
}

/** The address a row opens, when it opens one. */
export function navAddressForId(id: string): NavAddress | undefined {
  const action = navActionForId(id);
  return action?.type === "address" ? action.address : undefined;
}

/** The first tree item that stands for `addressId`, if any. */
export function navItemIdForAddress(addressId: string): string | null {
  for (const [itemId, action] of projection().actions) {
    if (action.type === "address" && action.address.id === addressId) return itemId;
  }
  return null;
}

/** A Bot's mark lookup for a row, by the address it opens. */
export function navBotForId(id: string): Bot | null {
  const action = projection().actions.get(id);
  if (action?.type !== "address") return null;
  const botId =
    action.address.botId ??
    (action.address.dialogueId
      ? registry().dialogues.find((item) => item.id === action.address.dialogueId)?.botId
      : null);
  if (!botId) return null;
  return registry().bots.find((bot) => bot.id === botId) ?? null;
}

/** Kind hint for Tree row icons (by item id prefix / known actions). */
export function navKindForId(id: string): NavAddress["kind"] | "section" | "folder" {
  if (id.startsWith("root:")) return "section";
  // A v3 / v4 row carries no address but still shows what it is.
  if (id.startsWith("legacy:bot:")) {
    return id.includes("/dlg/") ? (id.includes("/s/") ? "session" : "dialogue") : "bot";
  }
  if (id.startsWith("legacy:dlg/")) return id.includes("/s/") ? "session" : "dialogue";
  const action = navActionForId(id);
  if (action?.type === "space") return "space";
  if (action?.type === "newBot") return "bot";
  if (action?.type === "address") return action.address.kind;
  return "folder";
}

/** Working / unread / attention decoration for one Navigator row. */
export function navStatusForId(id: string): NavStatus | undefined {
  return projection().statuses.get(id);
}

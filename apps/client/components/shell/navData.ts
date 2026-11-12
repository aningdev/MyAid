/**
 * The Navigator's sections, projected from the desktop registry
 * (`Bot → Dialogue → claimed Session`), the session roster's titles and the
 * person's pinned addresses. One pure function, so the tree and its address
 * map are testable; `Navigator` only draws what this gives it.
 */
import { computed } from "nsh";
import type { TreeItem } from "nsh/base";

import type { Bot, BotRegistry, Dialogue, SessionClaim } from "../../features/bots/model";
import { sessionLabel } from "../../features/bots/sessions";
import { registry } from "../../features/bots/state";
import { sessionList, type SessionRow } from "../../features/dialogue/session/runtime";
import { favorites } from "./favorites";
import { PARKED_NAV, parkedActionForId } from "./fixtures";
import {
  botAddress,
  dialogueAddress,
  dialogueLabels,
  dialogueSegment,
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
  /** Live roster rows: their labels are the newest session titles. */
  rows: readonly SessionRow[];
  /** Pinned addresses (Favorites), already in the person's order. */
  favorites?: readonly NavAddress[];
  /** The sidebar filter: a case-insensitive substring of titles, names and paths. */
  query?: string;
};

/** The tree item id of the new-Bot draft (a leaf under an empty Bots section). */
export const NEW_BOT_ITEM_ID = "bots:new";

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

export function projectNav(input: NavInput): NavProjection {
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
  const claimMatches = (claim: SessionClaim, dialogue: Dialogue): boolean => {
    const label = labelOf(claim);
    return (
      contains(label, query) ||
      contains(botName(dialogue.botId), query) ||
      contains(dialogue.workspacePath, query) ||
      contains(dialogue.name, query)
    );
  };
  const dialogueMatches = (dialogue: Dialogue): boolean =>
    contains(dialogueSegment(dialogue), query) ||
    contains(dialogue.workspacePath, query) ||
    contains(botName(dialogue.botId), query) ||
    dialogue.claims.some((claim) => !claim.archived && claimMatches(claim, dialogue));
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
    dialogue.claims
      // An archived claim left the product's lists; dsh still has the Session.
      .filter((claim) => !claim.archived && include(claim))
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

  // Dialogues keep the registry's order (it has no timestamp to sort by);
  // a Dialogue's sessions keep the claims' order (new sessions last).
  const active = input.registry.dialogues.filter((dialogue) => !dialogue.archived);
  // Two Dialogues on one workspace read apart ("myaid", "myaid · 2").
  const dialogueNames = dialogueLabels({ dialogues: active, botName });

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
            const dialogueAddr = dialogueAddress({
              id: dialogue.id,
              workspacePath: dialogue.workspacePath,
              botId: bot.id,
              botName: bot.name,
              ...(names ? { label: names.full } : {}),
            });
            addressAction(`bots:${bot.id}/${dialogue.id}`, dialogueAddr);
            // A Bot that matched shows all its Sessions; a Dialogue that
            // matched on one Session still shows the others beside it.
            const include = (claim: SessionClaim) =>
              !query || botHit || dialogueMatches(dialogue) || claimMatches(claim, dialogue);
            return {
              id: `bots:${bot.id}/${dialogue.id}`,
              label: names?.segment ?? dialogueSegment(dialogue),
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

  const dialogueSection = (): TreeItem =>
    section(
      "root:dialogues",
      "Dialogues",
      active
        .filter((dialogue) => !query || dialogueMatches(dialogue))
        .map((dialogue) => {
          const name = botName(dialogue.botId);
          const names = dialogueNames.get(dialogue.id);
          const address = dialogueAddress({
            id: dialogue.id,
            workspacePath: dialogue.workspacePath,
            botId: dialogue.botId,
            botName: name,
            ...(names ? { label: names.full } : {}),
          });
          addressAction(`dialogues:${dialogue.id}`, address);
          return {
            id: `dialogues:${dialogue.id}`,
            label: address.title,
            children: sessionLeaves(
              `dialogues:${dialogue.id}`,
              dialogue,
              [`dialogues:${dialogue.id}`],
              (claim) => !query || dialogueMatches(dialogue) || claimMatches(claim, dialogue),
            ),
          };
        }),
    );

  const botTree = botSection();
  const dialogueTree = dialogueSection();

  // Favorites last to build, first to show: their rows read the addresses
  // the sections above just made, so a renamed Bot or Session reads current.
  const favoriteRows: TreeItem[] = [];
  if (!query) {
    const seen = new Set<string>();
    for (const pin of input.favorites ?? []) {
      const live = addresses.get(pin.id);
      if (!live || seen.has(live.id)) continue;
      seen.add(live.id);
      addressAction(`fav:${live.id}`, live);
      favoriteRows.push({ id: `fav:${live.id}`, label: live.title });
    }
  } else {
    for (const pin of input.favorites ?? []) {
      const live = addresses.get(pin.id);
      if (!live || !contains(live.title, query)) continue;
      addressAction(`fav:${live.id}`, live);
      favoriteRows.push({ id: `fav:${live.id}`, label: live.title });
    }
  }

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

  const items: TreeItem[] = query
    ? [section("root:favorites", "Favorites", favoriteRows), botTree, dialogueTree]
    : [
        section("root:favorites", "Favorites", favoriteRows),
        parked("mail"),
        parked("task"),
        parked("knowledge"),
        botTree,
        dialogueTree,
        parked("spaces"),
        parked("settings"),
      ];

  return { items, actions, addresses, statuses };
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

const projection = computed(() =>
  projectNav({
    registry: registry(),
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

/** Kind hint for Tree row icons (by item id prefix / known actions). */
export function navKindForId(id: string): NavAddress["kind"] | "section" | "folder" {
  if (id.startsWith("root:")) return "section";
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

/**
 * The Navigator's Bots and Dialogues sections, projected from the desktop
 * registry (`Bot → Dialogue → claimed Session`) and the session roster's
 * titles. One pure function, so the tree and its address map are testable;
 * `Navigator` only draws what this gives it.
 */
import { computed } from "nsh";
import type { TreeItem } from "nsh/base";

import type { BotRegistry, Dialogue, SessionClaim } from "../../features/bots/model";
import { sessionLabel } from "../../features/bots/sessions";
import { registry } from "../../features/bots/state";
import { sessionList, type SessionRow } from "../../features/dialogue/session/runtime";
import { PARKED_NAV, parkedActionForId } from "./fixtures";
import {
  botAddress,
  dialogueAddress,
  dialogueLabels,
  newBotAddress,
  sessionAddress,
} from "./navAddresses";
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
};

/** The tree item id of the new-Bot draft (a leaf under an empty Bots section). */
export const NEW_BOT_ITEM_ID = "bots:new";

/** One section's header (children only; the section itself is not an address). */
function section(id: string, label: string, children: TreeItem[]): TreeItem {
  return { id, label, children };
}

export function projectNav(input: NavInput): NavProjection {
  const actions = new Map<string, NavAction>();
  const addresses = new Map<string, NavAddress>();
  const statuses = new Map<string, NavStatus>();

  const addressAction = (itemId: string, address: NavAddress): NavAction => {
    actions.set(itemId, { type: "address", address });
    addresses.set(address.id, address);
    return { type: "address", address };
  };

  const labels = new Map(input.rows.map((row) => [row.id, row.label]));
  const rows = new Map(input.rows.map((row) => [row.id, row]));
  const botName = (id: string) => input.registry.bots.find((bot) => bot.id === id)?.name ?? "";
  const labelOf = (claim: SessionClaim) => labels.get(claim.sessionId) ?? sessionLabel(claim, null);
  const statusOf = (sessionId: string): NavStatus => {
    const row = rows.get(sessionId);
    return row
      ? { working: row.running, unread: row.unread, attention: row.attention }
      : EMPTY_STATUS;
  };

  const sessionLeaves = (itemPrefix: string, dialogue: Dialogue, ancestors: string[]): TreeItem[] =>
    dialogue.claims.map((claim) => {
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

  /** An empty Bots section still offers the way in: the new-Bot draft. */
  const newBotLeaf = (): TreeItem => {
    addressAction(NEW_BOT_ITEM_ID, newBotAddress());
    return { id: NEW_BOT_ITEM_ID, label: "New Bot" };
  };

  const bots = section(
    "root:bots",
    "Bots",
    input.registry.bots.length === 0
      ? [newBotLeaf()]
      : input.registry.bots.map((bot) => {
          addressAction(`bots:${bot.id}`, botAddress(bot));
          const children = active
            .filter((dialogue) => dialogue.botId === bot.id)
            .map((dialogue) => {
              const names = dialogueNames.get(dialogue.id);
              const label = names?.segment ?? "";
              const dialogueAddr = dialogueAddress({
                id: dialogue.id,
                workspacePath: dialogue.workspacePath,
                botId: bot.id,
                botName: bot.name,
                ...(names ? { label: names.full } : {}),
              });
              addressAction(`bots:${bot.id}/${dialogue.id}`, dialogueAddr);
              return {
                id: `bots:${bot.id}/${dialogue.id}`,
                label,
                children: sessionLeaves(`bots:${bot.id}/${dialogue.id}`, dialogue, [
                  `bots:${bot.id}/${dialogue.id}`,
                  `bots:${bot.id}`,
                ]),
              };
            });
          return { id: `bots:${bot.id}`, label: bot.name, children };
        }),
  );

  const dialogues = section(
    "root:dialogues",
    "Dialogues",
    active.map((dialogue) => {
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
        children: sessionLeaves(`dialogues:${dialogue.id}`, dialogue, [`dialogues:${dialogue.id}`]),
      };
    }),
  );

  // Parked sections keep their fixtures' actions (Spaces apply, others open).
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

  const items: TreeItem[] = [
    parked("favorites"),
    parked("mail"),
    parked("task"),
    parked("knowledge"),
    bots,
    dialogues,
    parked("spaces"),
    parked("settings"),
  ];

  return { items, actions, addresses, statuses };
}

const projection = computed(() => projectNav({ registry: registry(), rows: sessionList() }));

/** The whole Navigator tree, as the shell roots stand now. */
export function navItems(): TreeItem[] {
  return projection().items;
}

/** What pressing the tree item of `id` does. */
export function navActionForId(id: string): NavAction | undefined {
  return projection().actions.get(id);
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
  if (action?.type === "address") return action.address.kind;
  return "folder";
}

/** Working / unread / attention decoration for one Navigator row. */
export function navStatusForId(id: string): NavStatus | undefined {
  return projection().statuses.get(id);
}

/**
 * The Navigator's rows, projected from the desktop registry, the session
 * roster and the person's pins. One pure function (`botList`), so the list's
 * order and its live marks are testable without a window; the Navigator only
 * draws what it returns.
 *
 * Order: pinned Bots in the person's pin order, then the rest with the Main
 * Bot first and the others by recent activity (a Bot's Workspaces and
 * Sessions, newest first), then by name.
 * Archived Bots leave the list; a search still finds them, so they can be
 * brought back.
 */
import { computed } from "nsh";

import { isMainBot, type Bot, type BotRegistry } from "../../features/bots/model";
import { botActivity } from "../../features/bots/sessions";
import { registry } from "../../features/bots/state";
import { sessionList, type SessionRow } from "../../features/dialogue/session/runtime";
import type { WorkspaceProjection } from "../../features/workspace/projection";
import { workspaces } from "../../features/workspace/state";
import { navQuery } from "./navFilter";
import { pins } from "./pins";

/** One Bot as the list shows it. */
export type BotRow = {
  bot: Bot;
  /** A turn of this Bot's is running: its mark breathes and a dot shows. */
  working: boolean;
  /** Replies that landed while the person was not looking at this Bot. */
  unread: number;
  /** An approval waits in one of this Bot's Sessions. */
  attention: boolean;
  /** Newest activity, in milliseconds (`0` when nothing is known yet). */
  activity: number;
  pinned: boolean;
};

export type BotList = {
  pinned: BotRow[];
  others: BotRow[];
  /** Found by a search only; the list hides them otherwise. */
  archived: BotRow[];
};

export type BotListInput = {
  registry: BotRegistry;
  workspaces: WorkspaceProjection;
  rows: readonly SessionRow[];
  /** Pinned Bot ids, in the person's order. */
  pins: readonly string[];
  query?: string;
};

export function normalizeQuery(query: string | undefined): string {
  return (query ?? "").trim().toLocaleLowerCase();
}

function matches(bot: Bot, query: string): boolean {
  if (!query) return true;
  return (
    bot.name.toLocaleLowerCase().includes(query) ||
    (bot.description ?? "").toLocaleLowerCase().includes(query)
  );
}

/** The list for the registry as it is now. */
export function botList(input: BotListInput): BotList {
  const query = normalizeQuery(input.query);
  const rowsOf = (botId: string) => input.rows.filter((row) => row.botId === botId);
  const order = new Map(input.pins.map((id, index) => [id, index]));
  const toRow = (bot: Bot): BotRow => {
    const rows = rowsOf(bot.id);
    return {
      bot,
      working: rows.some((row) => row.running),
      unread: rows.filter((row) => row.unread).length,
      attention: rows.some((row) => row.attention),
      activity: botActivity(input.registry, input.workspaces, rows, bot.id),
      pinned: order.has(bot.id),
    };
  };

  const known = new Map(input.registry.bots.map((bot) => [bot.id, bot]));
  const pinned: BotRow[] = [];
  for (const id of input.pins) {
    const bot = known.get(id);
    if (!bot || bot.archived) continue;
    if (!matches(bot, query)) continue;
    pinned.push(toRow(bot));
  }
  const pinnedIds = new Set(pinned.map((row) => row.bot.id));

  const others = input.registry.bots
    .filter((bot) => !bot.archived && !pinnedIds.has(bot.id) && matches(bot, query))
    .map(toRow)
    .sort((left, right) => {
      const main = Number(isMainBot(right.bot)) - Number(isMainBot(left.bot));
      if (main !== 0) return main;
      if (left.activity !== right.activity) return right.activity - left.activity;
      return left.bot.name.localeCompare(right.bot.name);
    });

  // An archive is out of sight unless the search names it: then it shows with
  // the way back, so archiving is never a one-way door.
  const archived = query
    ? input.registry.bots.filter((bot) => bot.archived && matches(bot, query)).map(toRow)
    : [];

  return { pinned, others, archived };
}

const projection = computed(() =>
  botList({
    registry: registry(),
    workspaces: workspaces(),
    rows: sessionList(),
    pins: pins(),
    query: navQuery(),
  }),
);

/** The whole list as the registry, the roster, the pins and the search stand now. */
export function botRows(): BotList {
  return projection();
}

/** One Bot's row, wherever it stands (pinned, active or found by a search). */
export function botRowOf(botId: string): BotRow | null {
  const list = projection();
  for (const row of [...list.pinned, ...list.others, ...list.archived]) {
    if (row.bot.id === botId) return row;
  }
  return null;
}

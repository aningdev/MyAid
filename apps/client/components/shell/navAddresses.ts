/**
 * Nav addresses for the product's own objects: Bot → Dialogue → Session.
 * Ids are domain ids (not tree paths), so the same Dialogue opens its Panel
 * from the Bots section and from the Dialogues section alike.
 */
import type { NavAddress } from "./types";

/** The last segment of a workspace path (the name a person knows it by). */
export function workspaceSegment(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  if (!trimmed) return path.trim();
  const at = trimmed.lastIndexOf("/");
  return at >= 0 ? trimmed.slice(at + 1) || trimmed : trimmed;
}

/** "Bot · title" — how a Dialogue reads outside its Bot's tree. */
export function dialogueLabel(botName: string, title: string): string {
  const name = title.trim();
  if (!botName) return name;
  return name ? `${botName} · ${name}` : botName;
}

/** A Dialogue's name is its Workspace's title; unknown reads as empty. */
export function dialogueSegment(title: string): string {
  return title.trim();
}

/**
 * Dialogue names that tell two Dialogues on one name apart: the first keeps
 * its plain name, the next ones carry "· 2", "· 3" (registry order).
 * `segment` is the name inside its Bot's tree, `full` the one outside it.
 */
export function dialogueLabels(input: {
  dialogues: readonly { id: string; botId: string; title: string }[];
  botName: (botId: string) => string;
}): Map<string, { full: string; segment: string }> {
  const totals = new Map<string, number>();
  for (const dialogue of input.dialogues) {
    const key = `=${dialogue.botId}=${dialogueSegment(dialogue.title)}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const labels = new Map<string, { full: string; segment: string }>();
  for (const dialogue of input.dialogues) {
    const key = `=${dialogue.botId}=${dialogueSegment(dialogue.title)}`;
    const index = (seen.get(key) ?? 0) + 1;
    seen.set(key, index);
    const suffix = (totals.get(key) ?? 0) > 1 ? ` · ${index}` : "";
    const segment = `${dialogueSegment(dialogue.title)}${suffix}`;
    const bot = input.botName(dialogue.botId);
    labels.set(dialogue.id, { full: bot ? `${bot} · ${segment}` : segment, segment });
  }
  return labels;
}

export function botAddress(bot: { id: string; name: string }): NavAddress {
  return {
    id: `bot:${bot.id}`,
    root: "bots",
    path: [bot.name],
    title: bot.name,
    kind: "bot",
    botId: bot.id,
  };
}

export function dialogueAddress(input: {
  id: string;
  /** The Workspace title (the Dialogue's name). */
  title: string;
  botId?: string;
  botName: string;
  /** The disambiguated name, when two Dialogues read the same inside a Bot. */
  label?: string;
}): NavAddress {
  const label = input.label ?? dialogueLabel(input.botName, input.title);
  return {
    id: `dialogue:${input.id}`,
    root: "dialogues",
    path: [label],
    title: label,
    kind: "dialogue",
    dialogueId: input.id,
    ...(input.botId ? { botId: input.botId } : {}),
  };
}

/** The Settings section's real leaf: the two Background Services. */
export function backgroundSettingsAddress(): NavAddress {
  return {
    id: "setting:background",
    root: "settings",
    path: ["Background Services"],
    title: "Background Services",
    kind: "setting",
  };
}

export function sessionAddress(input: {
  sessionId: string;
  label: string;
  botId?: string;
  dialogueId?: string;
}): NavAddress {
  return {
    id: `session:${input.sessionId}`,
    root: "dialogues",
    path: [input.label],
    title: input.label,
    kind: "session",
    sessionId: input.sessionId,
    ...(input.botId ? { botId: input.botId } : {}),
    ...(input.dialogueId ? { dialogueId: input.dialogueId } : {}),
  };
}

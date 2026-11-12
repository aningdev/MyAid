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

/** "Bot · workspace" — how a Dialogue reads outside its Bot's tree. */
export function dialogueLabel(botName: string, workspacePath: string): string {
  const segment = workspaceSegment(workspacePath);
  if (!botName) return segment;
  return segment ? `${botName} · ${segment}` : botName;
}

/** The address of the new-Bot draft (no stored Bot yet). */
export const NEW_BOT_ADDRESS_ID = "bot:new";

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

export function newBotAddress(): NavAddress {
  return {
    id: NEW_BOT_ADDRESS_ID,
    root: "bots",
    path: ["New Bot"],
    title: "New Bot",
    kind: "bot",
  };
}

export function dialogueAddress(input: {
  id: string;
  workspacePath: string;
  botId?: string;
  botName: string;
}): NavAddress {
  return {
    id: `dialogue:${input.id}`,
    root: "dialogues",
    path: [dialogueLabel(input.botName, input.workspacePath)],
    title: dialogueLabel(input.botName, input.workspacePath),
    kind: "dialogue",
    dialogueId: input.id,
    ...(input.botId ? { botId: input.botId } : {}),
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

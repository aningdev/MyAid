import { untracked } from "nsh";

import { botAddress } from "../../components/shell/navAddresses";
import { openAddress } from "../../components/shell/state";
import { registry } from "../bots/state";
import { setModule, type ModuleId } from "../moduleHost";
import { openMain } from "./nav";
import { createSession } from "./session/runtime";
import { bumpChatEpoch, selectItem, sessionScopeBotId, sessionScopeDialogueId } from "./state";

/** Primary navigation. An approval stays with its own Session; it never blocks moving. */
export function openModule(id: ModuleId): void {
  if (id === "dialogue") {
    sessionScopeBotId.set(null);
    sessionScopeDialogueId.set(null);
    selectItem(null);
  }
  setModule(id);
}

/** Open one ready Bot's Dialogues (session list scoped to that bot). */
export function openBotDialogues(botId: string): void {
  const bot = untracked(registry).bots.find((item) => item.id === botId);
  if (!bot || bot.status !== "ready") return;
  sessionScopeBotId.set(botId);
  sessionScopeDialogueId.set(null);
  selectItem(null);
  setModule("dialogue");
}

/** @deprecated Prefer {@link openBotDialogues}. */
export function openBotSessions(botId: string): void {
  openBotDialogues(botId);
}

/** Focus Sessions inside one Dialogue. */
export function openDialogueSessions(dialogueId: string): void {
  const dialogue = untracked(registry).dialogues.find((item) => item.id === dialogueId);
  if (!dialogue) return;
  sessionScopeBotId.set(dialogue.botId);
  sessionScopeDialogueId.set(dialogueId);
  selectItem(null);
  setModule("dialogue");
}

/** Show a Bot in the Workbench (its Panel), whatever the keyboard was on. */
export function openOwningBot(botId: string): void {
  const bot = untracked(registry).bots.find((item) => item.id === botId);
  if (!bot) return;
  openAddress(botAddress(bot));
}

/** Create a claimed Session for a Dialogue and open it in Dialogue main. */
export async function createAndOpenSession(dialogueId: string): Promise<string> {
  sessionScopeDialogueId.set(dialogueId);
  const dialogue = untracked(registry).dialogues.find((item) => item.id === dialogueId);
  if (dialogue) sessionScopeBotId.set(dialogue.botId);
  const id = await createSession(dialogueId);
  selectItem(id);
  bumpChatEpoch();
  openMain(id);
  return id;
}

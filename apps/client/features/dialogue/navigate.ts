import { untracked } from "nsh";

import { editBot, registry } from "../bots/state";
import { setModule, type ModuleId } from "../moduleHost";
import { openMain } from "./nav";
import { approvalLock, approvalOwnerBotId, createSession } from "./session/runtime";
import { bumpChatEpoch, selectItem, sessionScopeBotId, sessionScopeDialogueId } from "./state";

/** Primary navigation. A pending approval can move only between its session and its bot. */
export function openModule(id: ModuleId): void {
  const owner = approvalOwnerBotId();
  if (owner) {
    if (id === "bots") {
      if (approvalLock({ botId: owner })) return;
      editBot(owner);
      setModule("bots");
      return;
    }
    approvalLock({ allSessions: true });
    return;
  }
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
  if (approvalLock({ botId })) return;
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
  if (approvalLock({ dialogueId })) return;
  sessionScopeBotId.set(dialogue.botId);
  sessionScopeDialogueId.set(dialogueId);
  selectItem(null);
  setModule("dialogue");
}

export function openOwningBot(botId: string): void {
  if (approvalLock({ botId })) return;
  editBot(botId);
  setModule("bots");
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

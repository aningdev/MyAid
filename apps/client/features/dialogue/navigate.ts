import { untracked } from "nsh";

import { setModule, type ModuleId } from "../../workspace/state";
import { editBot, registry } from "../bots/state";
import { approvalLock, approvalOwnerBotId } from "./session/runtime";
import { selectItem, sessionScopeBotId } from "./state";

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
    selectItem(null);
  }
  setModule(id);
}

/** Open one ready Bot's session list. Does not open a conversation. */
export function openBotSessions(botId: string): void {
  const bot = untracked(registry).bots.find((item) => item.id === botId);
  if (!bot || bot.status !== "ready") return;
  if (approvalLock({ botId })) return;
  sessionScopeBotId.set(botId);
  selectItem(null);
  setModule("dialogue");
}

export function openOwningBot(botId: string): void {
  if (approvalLock({ botId })) return;
  editBot(botId);
  setModule("bots");
}

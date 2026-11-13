/** Stable, namespaced identity for one Bot's derived preset. */
import { createHash } from "node:crypto";

/** Every derived preset id starts with this namespace. */
export const DERIVED_PREFIX = "myaid-bot-";

/**
 * Stable id for one Bot. The digest keeps ids distinct even when two Bot ids
 * sanitize to the same prefix; a derived preset never collides with a profile
 * preset because of the `myaid-bot-` namespace.
 */
export function derivedPresetId(botId: string): string {
  const trimmed = botId.trim();
  if (trimmed === "") throw new Error("Bot id 不能为空。");
  const safe = trimmed.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  const digest = createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
  return `${DERIVED_PREFIX}${safe.slice(0, 48) || "bot"}-${digest}`;
}

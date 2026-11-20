/**
 * Error codes the `bots` Remote throws for Registry writes.
 *
 * The Client discriminates by code, never by message.
 */
import type {} from "@deepseek-ai/dsh-typert-protocol";

export type RegistryWriteIssue = "not-found" | "invalid" | "main-bot";

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    /** The Bot or template does not exist. */
    "bots/not-found": {
      readonly kind: "bot" | "template";
      readonly id: string;
    };
    /** The write breaks a Registry rule; `reason` is the person-facing text. */
    "bots/invalid": {
      readonly reason: string;
    };
    /** The Main Bot cannot be archived or deleted. */
    "bots/main-bot": {
      readonly botId: string;
    };
  }
}

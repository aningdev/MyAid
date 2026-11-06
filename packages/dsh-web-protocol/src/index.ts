/**
 * Client-only barrel for official dsh web Remote / wire types.
 *
 * Prefer domain subpaths (`@myaid/dsh-web-protocol/session`, …).
 * Root uses namespace re-exports to avoid cross-domain name collisions.
 *
 * Plugins must not import this package — use `@deepseek-ai/dsh-*` directly.
 */
export type * from "./remotes.ts";
export type * as Connection from "./connection.ts";
export type * as Session from "./session.ts";
export type * as Llm from "./llm.ts";
export type * as Presets from "./presets.ts";
export type * as Settings from "./settings.ts";
export type * as Workspace from "./workspace.ts";
export type * as Job from "./job.ts";
export type * as Terminal from "./terminal.ts";
export type * as Account from "./account.ts";
export type * as Commands from "./commands.ts";
export type * as Goals from "./goals.ts";
export type * as Schedule from "./schedule.ts";
export type * as Subagent from "./subagent.ts";
export type * as Interaction from "./interaction.ts";
export type * as Feedback from "./feedback.ts";
export type * as Uploads from "./uploads.ts";
export type * as References from "./references.ts";
export type * as Plugins from "./plugins.ts";
export type * as Docs from "./docs.ts";
export type * as CordisRunner from "./cordis.ts";
export type * as Analytics from "./analytics.ts";
export type * as Access from "./access.ts";

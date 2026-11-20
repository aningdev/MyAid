/**
 * Client-only barrel for the official dsh web Remote / wire types the product
 * imports.
 *
 * Prefer domain subpaths (`@dsh-bot/dsh-web-protocol/session`, …). Root uses
 * namespace re-exports to avoid cross-domain name collisions.
 *
 * Only surfaces with a real importer live here: a domain the product does not
 * call yet stays out, and reads `references/deepseek-harness` or the published
 * `@deepseek-ai/dsh-*` types directly until it does.
 *
 * Plugins must not import this package — use `@deepseek-ai/dsh-*` directly.
 */
export type * as Bots from "./bots.ts";
export type * as Client from "./client.ts";
export type * as Interaction from "./interaction.ts";
export type * as Llm from "./llm.ts";
export type * as Plugins from "./plugins.ts";
export type * as Session from "./session.ts";
export type * as Settings from "./settings.ts";
export type * as Workspace from "./workspace.ts";

// Public npm entry points; resolve with Node export conditions for QuickJS/NSH.
export { Context } from "@deepseek-ai/cordis";
export { installConnection } from "@deepseek-ai/dsh-client-connection/client";
export { default as TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
export * as Gateway from "@deepseek-ai/dsh-api-gateway/client";
export { default as sessionRemote } from "@deepseek-ai/dsh-api-session-controller/remote";
export { default as llmRemote } from "@deepseek-ai/dsh-llm/remote";
export { default as agentPresetsRemote } from "@deepseek-ai/dsh-agent-preset-registry/remote";
export { default as botPresetsRemote } from "dsh-bot-presets/remote";
export { default as workspaceRemote } from "@deepseek-ai/dsh-api-workspace-controller/remote";
export { default as settingsRemote } from "@deepseek-ai/dsh-api-settings-controller/remote";
export { default as fileUploadsRemote } from "@deepseek-ai/dsh-client-file-upload/remote";
export { default as pluginManagerRemote } from "@deepseek-ai/dsh-plugin-manager/remote";
export { default as pluginInventoryRemote } from "@deepseek-ai/dsh-host-plugin-inventory/remote";
export { default as commandsRemote } from "@deepseek-ai/dsh-commands/remote";
export { default as subagentsRemote } from "@deepseek-ai/dsh-subagent/remote";
// Client-side services the official Session model injects.
export { default as fileUploadClient } from "./generated/file-upload-client.js";
// Official React-free Client models (`bun run prepare:sdk` unwraps their
// `window.__ModuleLoader__` bundles; NSH cannot evaluate code from strings).
export { default as officialSessionClient } from "./generated/session-client.js";
export { default as officialWorkspaceClient } from "./generated/workspace-client.js";

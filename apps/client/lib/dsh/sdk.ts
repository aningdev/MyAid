// Public npm entry points; resolve with Node export conditions for QuickJS/NSH.
export { Context } from "@deepseek-ai/cordis";
export { installConnection } from "@deepseek-ai/dsh-client-connection/client";
export { default as TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
export * as Gateway from "@deepseek-ai/dsh-api-gateway/client";
export { default as sessionRemote } from "@deepseek-ai/dsh-api-session-controller/remote";
export { default as agentPresetsRemote } from "@deepseek-ai/dsh-agent-preset-registry/remote";
export { default as workspaceRemote } from "@deepseek-ai/dsh-api-workspace-controller/remote";
export { default as settingsRemote } from "@deepseek-ai/dsh-api-settings-controller/remote";
export { default as fileUploadsRemote } from "@deepseek-ai/dsh-client-file-upload/remote";
export { default as pluginManagerRemote } from "@deepseek-ai/dsh-plugin-manager/remote";

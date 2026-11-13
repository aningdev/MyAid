/**
 * Typert consumer face for `myaidBotPresets`.
 *
 * The Client mounts this contribution so it gets a typed namespace; the Host
 * side is the `@Remote`-marked `BotPresetsService`. DTOs live in
 * `./types.ts` (and are mirrored in `@myaid/dsh-web-protocol/bot-presets`).
 */
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";
import { z, type ZodType } from "zod";

import {
  botPresetDeriveRequestSchema,
  botPresetDeriveResultSchema,
  botPresetRecordSchema,
  botPresetRemoveResultSchema,
  botPresetUpdateRequestSchema,
} from "./wire";

const PACKAGE = "@myaid/myaid-plugin-bot-presets";

function codec<Value>(typeSymbol: string, schema: ZodType<Value>) {
  return {
    mode: "strict" as const,
    typeSymbol,
    create: () => schema,
  };
}

function input<Value>(name: string, typeSymbol: string, schema: ZodType<Value>) {
  return {
    name,
    source: "json" as const,
    codec: codec(typeSymbol, schema),
    strictCodec: codec(typeSymbol, schema),
  };
}

export const TYPERT_REMOTE = createTypertRemoteInfo(
  {
    package: PACKAGE,
    methods: {
      "myaidBotPresets/derive": {
        service: "myaidBotPresets",
        description: "Copy a Bot's base composition into its own derived preset.",
        invocation: { kind: "direct" },
        parameters: [input("request", `${PACKAGE}#derive:request`, botPresetDeriveRequestSchema)],
        result: codec(`${PACKAGE}#derive:result`, botPresetDeriveResultSchema),
      },
      "myaidBotPresets/read": {
        service: "myaidBotPresets",
        description: "Read one derived preset's saved plugin and skill selections.",
        invocation: { kind: "direct" },
        parameters: [input("presetId", `${PACKAGE}#read:presetId`, z.string())],
        result: codec(`${PACKAGE}#read:result`, botPresetRecordSchema),
      },
      "myaidBotPresets/update": {
        service: "myaidBotPresets",
        description: "Replace a derived preset's plugin and skill selections.",
        invocation: { kind: "direct" },
        parameters: [
          input("presetId", `${PACKAGE}#update:presetId`, z.string()),
          input("patch", `${PACKAGE}#update:patch`, botPresetUpdateRequestSchema),
        ],
        result: codec(`${PACKAGE}#update:result`, botPresetRecordSchema),
      },
      // `remove` is reserved by the Client's Remote namespace service, so the
      // wire name is `discard` while the Host method keeps its plain verb.
      "myaidBotPresets/discard": {
        service: "myaidBotPresets",
        description: "Remove a derived preset and its private skill copies.",
        implementation: "remove",
        invocation: { kind: "direct" },
        parameters: [input("presetId", `${PACKAGE}#discard:presetId`, z.string())],
        result: codec(`${PACKAGE}#discard:result`, botPresetRemoveResultSchema),
      },
    },
  },
  z,
);

export default TYPERT_REMOTE;

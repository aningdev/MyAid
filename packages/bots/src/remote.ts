/**
 * Typert consumer face for `bots`.
 *
 * The Client mounts this contribution so it gets a typed namespace; the Host
 * side is the `@Remote`-marked `BotsService`. Registry DTOs live in
 * `./registry.ts`, preset DTOs in `./preset-types.ts`, and the Client mirrors
 * the preset shapes in `@dsh-bot/dsh-web-protocol/bots`.
 */
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";
import { z, type ZodType } from "zod";

import {
  assignPresetRequestSchema,
  botsSnapshotSchema,
  botInputSchema,
  derivedPresetDeriveRequestSchema,
  derivedPresetDeriveResultSchema,
  derivedPresetRecordSchema,
  derivedPresetRemoveResultSchema,
  derivedPresetUpdateRequestSchema,
  claimSegmentRequestSchema,
  releaseSegmentRequestSchema,
  renameSegmentRequestSchema,
  templateInputSchema,
  updateBotRequestSchema,
  updateTemplateRequestSchema,
} from "./wire.ts";

const PACKAGE = "dsh-bots";

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

const snapshotResult = codec(`${PACKAGE}#snapshot:result`, botsSnapshotSchema);
const idInput = (name = "id") => input(name, `${PACKAGE}#${name}:id`, z.string());

export const TYPERT_REMOTE = createTypertRemoteInfo(
  {
    package: PACKAGE,
    methods: {
      "bots/snapshot": {
        service: "bots",
        description: "Read the Registry and its current revision.",
        invocation: { kind: "direct" },
        parameters: [],
        result: snapshotResult,
      },
      "bots/watch": {
        service: "bots",
        description: "Stream the Registry snapshot on subscription and after every write.",
        mode: "stream",
        invocation: { kind: "direct" },
        parameters: [],
        cancellation: { parameter: "signal" },
        result: snapshotResult,
      },
      "bots/createTemplate": {
        service: "bots",
        description: "Add a template that names one dsh Agent preset.",
        invocation: { kind: "direct" },
        parameters: [input("request", `${PACKAGE}#createTemplate:request`, templateInputSchema)],
        result: snapshotResult,
      },
      "bots/updateTemplate": {
        service: "bots",
        description: "Rename a template or point it at another preset.",
        invocation: { kind: "direct" },
        parameters: [
          input("request", `${PACKAGE}#updateTemplate:request`, updateTemplateRequestSchema),
        ],
        result: snapshotResult,
      },
      "bots/deleteTemplate": {
        service: "bots",
        description: "Delete a template no Bot uses.",
        invocation: { kind: "direct" },
        parameters: [idInput("templateId")],
        result: snapshotResult,
      },
      "bots/importTemplates": {
        service: "bots",
        description: "Upsert product templates from the dsh Agent preset list.",
        invocation: { kind: "direct" },
        parameters: [],
        result: snapshotResult,
      },
      "bots/createBot": {
        service: "bots",
        description: "Add a Bot in draft state.",
        invocation: { kind: "direct" },
        parameters: [input("request", `${PACKAGE}#createBot:request`, botInputSchema)],
        result: snapshotResult,
      },
      "bots/updateBot": {
        service: "bots",
        description: "Change a Bot's profile, defaults or identity mark.",
        invocation: { kind: "direct" },
        parameters: [input("request", `${PACKAGE}#updateBot:request`, updateBotRequestSchema)],
        result: snapshotResult,
      },
      "bots/initializeBot": {
        service: "bots",
        description: "Bind the template's preset and make a draft Bot ready.",
        invocation: { kind: "direct" },
        parameters: [idInput("botId")],
        result: snapshotResult,
      },
      "bots/claimSegment": {
        service: "bots",
        description: "Claim a dsh Session as the Bot's next segment.",
        invocation: { kind: "direct" },
        parameters: [
          input("request", `${PACKAGE}#claimSegment:request`, claimSegmentRequestSchema),
        ],
        result: snapshotResult,
      },
      "bots/renameSegment": {
        service: "bots",
        description: "Set or clear a segment's title.",
        invocation: { kind: "direct" },
        parameters: [
          input("request", `${PACKAGE}#renameSegment:request`, renameSegmentRequestSchema),
        ],
        result: snapshotResult,
      },
      "bots/releaseSegment": {
        service: "bots",
        description: "Drop a segment whose dsh Session is gone.",
        invocation: { kind: "direct" },
        parameters: [
          input("request", `${PACKAGE}#releaseSegment:request`, releaseSegmentRequestSchema),
        ],
        result: snapshotResult,
      },
      "bots/archive": {
        service: "bots",
        description: "Archive a Bot; Main Bot is rejected.",
        invocation: { kind: "direct" },
        parameters: [idInput("botId")],
        result: snapshotResult,
      },
      "bots/unarchive": {
        service: "bots",
        description: "Bring an archived Bot back into the list.",
        invocation: { kind: "direct" },
        parameters: [idInput("botId")],
        result: snapshotResult,
      },
      "bots/deleteBot": {
        service: "bots",
        description: "Delete a Bot that never had a segment; Main Bot is rejected.",
        invocation: { kind: "direct" },
        parameters: [idInput("botId")],
        result: snapshotResult,
      },
      "bots/assignPreset": {
        service: "bots",
        description: "Record the derived preset a Bot owns.",
        invocation: { kind: "direct" },
        parameters: [
          input("request", `${PACKAGE}#assignPreset:request`, assignPresetRequestSchema),
        ],
        result: snapshotResult,
      },
      "bots/derivePreset": {
        service: "bots",
        description: "Copy a Bot's base composition into its own derived preset.",
        invocation: { kind: "direct" },
        parameters: [
          input("request", `${PACKAGE}#derivePreset:request`, derivedPresetDeriveRequestSchema),
        ],
        result: codec(`${PACKAGE}#derivePreset:result`, derivedPresetDeriveResultSchema),
      },
      "bots/readPreset": {
        service: "bots",
        description: "Read one derived preset's saved plugin and skill selections.",
        invocation: { kind: "direct" },
        parameters: [input("presetId", `${PACKAGE}#readPreset:presetId`, z.string())],
        result: codec(`${PACKAGE}#readPreset:result`, derivedPresetRecordSchema),
      },
      "bots/updatePreset": {
        service: "bots",
        description: "Replace a derived preset's plugin and skill selections.",
        invocation: { kind: "direct" },
        parameters: [
          input("presetId", `${PACKAGE}#updatePreset:presetId`, z.string()),
          input("patch", `${PACKAGE}#updatePreset:patch`, derivedPresetUpdateRequestSchema),
        ],
        result: codec(`${PACKAGE}#updatePreset:result`, derivedPresetRecordSchema),
      },
      "bots/discardPreset": {
        service: "bots",
        description: "Remove a derived preset and its private skill copies.",
        invocation: { kind: "direct" },
        parameters: [input("presetId", `${PACKAGE}#discardPreset:presetId`, z.string())],
        result: codec(`${PACKAGE}#discardPreset:result`, derivedPresetRemoveResultSchema),
      },
    },
  },
  z,
);

export default TYPERT_REMOTE;

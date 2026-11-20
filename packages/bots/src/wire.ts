/** Zod schemas for the `bots` Remote's wire values. */
import { z } from "zod";

import {
  derivedPresetDeriveRequestSchema,
  derivedPresetDeriveResultSchema,
  derivedPresetRecordSchema,
  derivedPresetRemoveResultSchema,
  derivedPresetUpdateRequestSchema,
} from "./preset-wire.ts";
import { botIdentitySchema, botSchema, registrySchema } from "./registry.ts";

export const botsSnapshotSchema = z.object({
  registry: registrySchema,
  revision: z.number().int().nonnegative(),
});

export const templateInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  presetId: z.string(),
});

export const templatePatchSchema = z.object({
  name: z.string().optional(),
  presetId: z.string().optional(),
});

export const updateTemplateRequestSchema = z.object({
  id: z.string(),
  patch: templatePatchSchema,
});

export const botInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  templateId: z.string(),
  defaultModel: z.string().nullable().optional(),
  defaultThinking: z.string().nullable().optional(),
  defaultWorkspacePath: z.string().nullable().optional(),
  identity: botIdentitySchema.optional(),
});

export const botPatchSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  templateId: z.string().optional(),
  defaultModel: z.string().nullable().optional(),
  defaultThinking: z.string().nullable().optional(),
  defaultWorkspacePath: z.string().nullable().optional(),
  identity: botIdentitySchema.optional(),
});

export const updateBotRequestSchema = z.object({
  id: z.string(),
  patch: botPatchSchema,
});

export const claimSegmentRequestSchema = z.object({
  botId: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
});

export const renameSegmentRequestSchema = z.object({
  botId: z.string(),
  sessionId: z.string(),
  title: z.string().nullable(),
});

export const releaseSegmentRequestSchema = z.object({
  botId: z.string(),
  sessionId: z.string(),
});

export const assignPresetRequestSchema = z.object({
  botId: z.string(),
  presetId: z.string(),
});

export const presetUpdateRequestSchema = z.object({
  presetId: z.string(),
  patch: derivedPresetUpdateRequestSchema,
});

export {
  botIdentitySchema,
  derivedPresetDeriveRequestSchema,
  derivedPresetDeriveResultSchema,
  derivedPresetRecordSchema,
  derivedPresetRemoveResultSchema,
  derivedPresetUpdateRequestSchema,
  botSchema,
  registrySchema,
};

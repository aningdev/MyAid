/** Zod schemas for the Remote's wire values. Shared by the domain and `remote`. */
import { z } from "zod";

export const botPresetSkillSchema = z.object({
  name: z.string(),
  path: z.string(),
});

export const botPresetPluginSchema = z.object({
  entryId: z.string().nullable(),
  moduleName: z.string(),
  enabled: z.boolean(),
});

export const botPresetRecordSchema = z.object({
  presetId: z.string(),
  botId: z.string(),
  basePresetId: z.string(),
  label: z.string(),
  skills: z.array(botPresetSkillSchema).readonly(),
  plugins: z.array(botPresetPluginSchema).readonly(),
  broken: z.string().optional(),
});

export const botPresetDeriveRequestSchema = z.object({
  botId: z.string(),
  label: z.string(),
  basePresetId: z.string(),
});

export const botPresetUpdateRequestSchema = z.object({
  skills: z.array(z.string()).readonly().optional(),
  plugins: z.array(botPresetPluginSchema).readonly().optional(),
});

export const botPresetDeriveResultSchema = z.object({ presetId: z.string() });
export const botPresetRemoveResultSchema = z.object({ removed: z.boolean() });

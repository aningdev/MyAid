/** Zod schemas for the Remote's wire values. Shared by the domain and `remote`. */
import { z } from "zod";

export const derivedPresetSkillSchema = z.object({
  name: z.string(),
  path: z.string(),
});

export const derivedPresetPluginSchema = z.object({
  entryId: z.string().nullable(),
  moduleName: z.string(),
  enabled: z.boolean(),
});

export const derivedPresetRecordSchema = z.object({
  presetId: z.string(),
  botId: z.string(),
  basePresetId: z.string(),
  label: z.string(),
  skills: z.array(derivedPresetSkillSchema).readonly(),
  plugins: z.array(derivedPresetPluginSchema).readonly(),
  broken: z.string().optional(),
});

export const derivedPresetDeriveRequestSchema = z.object({
  botId: z.string(),
  label: z.string(),
  basePresetId: z.string(),
});

export const derivedPresetUpdateRequestSchema = z.object({
  skills: z.array(z.string()).readonly().optional(),
  plugins: z.array(derivedPresetPluginSchema).readonly().optional(),
});

export const derivedPresetDeriveResultSchema = z.object({ presetId: z.string() });
export const derivedPresetRemoveResultSchema = z.object({ removed: z.boolean() });

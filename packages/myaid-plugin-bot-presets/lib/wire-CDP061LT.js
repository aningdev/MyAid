import { z } from "zod";
// src/wire.ts
/** Zod schemas for the Remote's wire values. Shared by the domain and `remote`. */
const botPresetSkillSchema = z.object({
  name: z.string(),
  path: z.string(),
});
const botPresetPluginSchema = z.object({
  entryId: z.string().nullable(),
  moduleName: z.string(),
  enabled: z.boolean(),
});
const botPresetRecordSchema = z.object({
  presetId: z.string(),
  botId: z.string(),
  basePresetId: z.string(),
  label: z.string(),
  skills: z.array(botPresetSkillSchema).readonly(),
  plugins: z.array(botPresetPluginSchema).readonly(),
  broken: z.string().optional(),
});
const botPresetDeriveRequestSchema = z.object({
  botId: z.string(),
  label: z.string(),
  basePresetId: z.string(),
});
const botPresetUpdateRequestSchema = z.object({
  skills: z.array(z.string()).readonly().optional(),
  plugins: z.array(botPresetPluginSchema).readonly().optional(),
});
const botPresetDeriveResultSchema = z.object({ presetId: z.string() });
const botPresetRemoveResultSchema = z.object({ removed: z.boolean() });
export {
  botPresetUpdateRequestSchema as a,
  botPresetRemoveResultSchema as i,
  botPresetDeriveResultSchema as n,
  botPresetRecordSchema as r,
  botPresetDeriveRequestSchema as t,
};

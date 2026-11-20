/** Storage domain for derived presets: one record per Bot-owned preset. */
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";

import type { DerivedPresetRecord } from "./preset-types.ts";
import { derivedPresetRecordSchema } from "./preset-wire.ts";

/** Domain name; also the backend unit name under `$DSH_HOME/storages`. */
export const DOMAIN_NAME = "bots";

/** The stored record adds the copied base body, which is not a Client DTO. */
export const storedPresetSchema = derivedPresetRecordSchema.extend({
  /** Base composition YAML captured by `derive`; the derived preset's body. */
  baseYaml: z.string(),
  /** Host epoch milliseconds of the last update. */
  updatedAt: z.number(),
});

export type StoredPreset = z.infer<typeof storedPresetSchema>;

export const presetsDomainSpec = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  // One document for the whole table: these records are small and updated
  // rarely, and a single domain write keeps derive/update/remove atomic.
  tables: { presets: domainTable<string, StoredPreset>(storedPresetSchema) },
});

/** Strip the body before a record crosses the Remote boundary. */
export function publicRecord(stored: StoredPreset, broken?: string): DerivedPresetRecord {
  return {
    presetId: stored.presetId,
    botId: stored.botId,
    basePresetId: stored.basePresetId,
    label: stored.label,
    skills: stored.skills,
    plugins: stored.plugins,
    ...(broken === undefined ? {} : { broken }),
  };
}

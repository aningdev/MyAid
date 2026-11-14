/**
 * The Host-side capability Bot Settings cannot have from dsh alone: writing a
 * Bot's Agent preset. dsh exposes `agentPresets.list/read/select` only; preset
 * bodies live in the profile's YAML. `packages/bot-presets` owns the missing
 * writer and exposes it as the `botPresets` Remote.
 *
 * The seam stays here rather than in the sheet: the Client keeps the
 * registry's derived-preset rule (BOT_SESSION_MAP "身份与能力"), and the sheet
 * never invents a preset id. A Host without the plugin keeps today's honest
 * read-only note.
 */
import type {
  BotPresetDeriveRequest,
  BotPresetRecord,
  BotPresetRemoveResult,
  BotPresetUpdateRequest,
} from "@myaid/dsh-web-protocol/bot-presets";

import { t } from "../../lib/i18n";
import { sessionTransport } from "../dialogue/session/runtime";

/** One capability change the sheet asks the plugin to save. */
export type DeriveRequest = BotPresetDeriveRequest;
export type DeriveResult = { presetId: string } | { unavailable: string };
export type UpdateResult = BotPresetRecord | { unavailable: string };

/** What the plugin implements for Bot Settings › Skills / Plugins to save. */
export type BotPresetWriter = {
  /** Whether this Host has the Remote; `read` with an unknown id probes it. */
  probe(): Promise<boolean>;
  /** Copy the Bot's current preset into a Bot-owned derived preset. */
  derive(request: DeriveRequest): Promise<DeriveResult>;
  /** Read one derived preset's saved selections, or null when it is gone. */
  read(presetId: string): Promise<BotPresetRecord | null>;
  /** Replace the saved selections; omitted fields stay as saved. */
  update(presetId: string, patch: BotPresetUpdateRequest): Promise<UpdateResult>;
  /** Remove a derived preset and its private skill copies. */
  remove(presetId: string): Promise<BotPresetRemoveResult>;
};

/** Why capability edits cannot be saved, in the sheet and in the docs. */
export function presetWriteGap(): string {
  return t("presets.writeGap");
}

let replacement: BotPresetWriter | undefined;

/** The writer over the live Remote, or a test's substitute. */
export function presetWriter(): BotPresetWriter {
  return replacement ?? hostWriter();
}

/** Substitute the Host-side writer (a test's fake). */
export function setPresetWriter(next: BotPresetWriter | undefined): void {
  replacement = next;
}

function hostWriter(): BotPresetWriter {
  const transport = () => {
    const current = sessionTransport();
    return current?.ready ? current.botPresets : undefined;
  };
  return {
    probe: async () => {
      const remote = transport();
      if (!remote) return false;
      try {
        await remote.read("__myaid_probe__");
        return true;
      } catch (error) {
        // The namespace is mounted on the Client even when the Host plugin is
        // absent; only that dispatch failure means the writer is unavailable.
        return !isMissingRemote(error);
      }
    },
    derive: async (request) => {
      const remote = transport();
      if (!remote) return { unavailable: presetWriteGap() };
      try {
        return await remote.derive(request);
      } catch (error) {
        return { unavailable: readable(error) };
      }
    },
    read: async (presetId) => {
      const remote = transport();
      if (!remote) return null;
      try {
        return await remote.read(presetId);
      } catch {
        return null;
      }
    },
    update: async (presetId, patch) => {
      const remote = transport();
      if (!remote) return { unavailable: presetWriteGap() };
      try {
        return await remote.update(presetId, patch);
      } catch (error) {
        return { unavailable: readable(error) };
      }
    },
    remove: async (presetId) => {
      const remote = transport();
      if (!remote) return { removed: false };
      return remote.discard(presetId);
    },
  };
}

function isMissingRemote(error: unknown): boolean {
  const message = readable(error);
  return (
    message.includes("invocation-unavailable") ||
    message.includes("no active Remote method") ||
    message.includes("not mounted")
  );
}

function readable(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Where the Device's two records live: its static key (identity) and its one
// pairing. A store holds each record as text, so parsing and validation stay in
// `pairing.ts`. Desktop Devices keep them as files in the data root; targets
// without a filesystem keep them in nsh Storage. Which one a Device uses is
// decided once, where the store is built (`components/shell/device.ts`).

import fs from "fs/promises";
import { dirname, join } from "path";

/** The two records a Device keeps. */
export type DeviceRecord = "identity" | "pairing";

/** Reads, writes and removes the Device's records as text. */
export interface DeviceStore {
  /** The record's text; `null` when the Device has none. */
  read(record: DeviceRecord): Promise<string | null>;
  /** Replaces the record whole; a reader never sees half of it. */
  write(record: DeviceRecord, text: string): Promise<void>;
  /** Forgets the record; removing one that is not there is not an error. */
  remove(record: DeviceRecord): Promise<void>;
}

/** The part of nsh Storage the Storage-backed store uses. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEYS: Record<DeviceRecord, string> = {
  identity: "dsh-bot.device.identity",
  pairing: "dsh-bot.device.pairing",
};

/** The store for targets without a filesystem (web): nsh Storage. */
export function storageDeviceStore(storage: KeyValueStorage): DeviceStore {
  return {
    read: (record) => storage.getItem(STORAGE_KEYS[record]),
    write: (record, text) => storage.setItem(STORAGE_KEYS[record], text),
    remove: (record) => storage.removeItem(STORAGE_KEYS[record]),
  };
}

/** The part of `fs/promises` the file-backed store uses (nsh grants no `chmod`). */
export interface DeviceFs {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

/**
 * The store for desktop Devices: `<root>/device/identity.json` and
 * `<root>/device/pairing.json`, where `root` is the data root. A write goes to
 * a temporary file first and is renamed over the record.
 */
export function fileDeviceStore(root: string, files: DeviceFs = fs): DeviceStore {
  const pathOf = (record: DeviceRecord): string => join(root, "device", `${record}.json`);
  return {
    async read(record) {
      try {
        return await files.readFile(pathOf(record), "utf8");
      } catch (error) {
        if (errorCode(error) === "ENOENT") return null;
        throw error;
      }
    },
    async write(record, text) {
      const path = pathOf(record);
      await files.mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      await files.writeFile(temporary, text);
      await files.rename(temporary, path);
    },
    async remove(record) {
      try {
        await files.unlink(pathOf(record));
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
    },
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

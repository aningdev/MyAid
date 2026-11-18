/**
 * Files the user hands the app from outside it: a drop on the chat, or a
 * paste of files copied in Finder. Both gestures arrive as `file:` URLs, so
 * their bytes are read through `fs` — and `capabilities.fs.read` in nsh.json
 * is a list of roots, not of the files a user picked: nsh 0.5 has no
 * picker-scoped grant (the system's picker is the one gesture that hands
 * bytes over with no grant; a file merely opened or dropped is read under
 * `fs.read`, "which its opening does not grant").
 *
 * So one policy serves both gestures: read what the app can read, and for
 * every file that did not come through, ask for it in the system's open
 * dialog — the same file, the same gesture's outcome, no home-wide read
 * grant. Nothing lands silently, and a file too large for `readFile` comes
 * through the dialog too (its bytes never pass `fs`).
 */
import { Picker, type PickedFile } from "nsh";

import { t } from "../../../lib/i18n";
import { filesFromUrls } from "./files";

/** How many files one dialog may return: dsh takes a handful per prompt. */
const PICK_LIMIT = 8;

/** What a gesture attached, and what to tell the composer about it. */
export type AttachedFiles = {
  files: File[];
  /** A line for the composer under its chips, or `null` when nothing needs saying. */
  notice: string | null;
};

/**
 * The bytes a pick brought, and the names it did not: the picker hands over
 * `null` for a file past its size limit (`status` `"tooLarge"`), so the name
 * still says what was left behind.
 */
export function readFiles(picked: readonly PickedFile[]): { files: File[]; tooLarge: string[] } {
  const files: File[] = [];
  const tooLarge: string[] = [];
  for (const item of picked) {
    if (item.file) files.push(item.file);
    else tooLarge.push(item.name);
  }
  return { files, tooLarge };
}

/** The line a pick says about the files it could not read, or `null` when it read them all. */
export function tooLargeNotice(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return t("chat.attachTooLarge", { names: names.join(", ") });
}

/** The files the open dialog returned, or nothing (the user closed it). */
async function pickInstead(count: number): Promise<{ files: File[]; tooLarge: string[] }> {
  try {
    const picked = await Picker.pickFiles({
      multiple: count > 1,
      limit: Math.min(count, PICK_LIMIT),
    });
    return readFiles(picked);
  } catch {
    // No picker (a platform without one, the capability withheld): the
    // gesture is lost, and the notice says so.
    return { files: [], tooLarge: [] };
  }
}

/**
 * The files a drop or a paste of local files named, with the ones the app
 * could not read taken through the open dialog.
 */
export async function attachDropped(
  uris: readonly string[],
  mediaTypes: readonly string[] = [],
): Promise<AttachedFiles> {
  if (uris.length === 0) return { files: [], notice: null };
  const { files, unread } = await filesFromUrls(uris, mediaTypes);
  if (unread.length === 0) return { files, notice: null };
  const picked = await pickInstead(unread.length);
  if (picked.files.length > 0) {
    return {
      files: [...files, ...picked.files],
      notice: tooLargeNotice(picked.tooLarge),
    };
  }
  const missing = tooLargeNotice(picked.tooLarge);
  if (missing != null) return { files, notice: missing };
  const label =
    files.length === 0
      ? t("chat.attachNothing")
      : unread.length === 1
        ? t("chat.attachOtherOne")
        : t("chat.attachOtherMany");
  return { files, notice: t("chat.attachDialog", { missing: label }) };
}

/**
 * The composer's attachments: what a picked, pasted or dropped file becomes,
 * and the chip list's pure operations. Bytes stay in the app (a `Blob`), a
 * preview is a blob URL, and only what is sent leaves for dsh.
 */
import type { ImageMediaType } from "@dsh-bot/dsh-web-protocol/session";

import { t } from "../../../lib/i18n";

export type Attachment = {
  id: string;
  name: string;
  /** "12 KB", "1.4 MB". */
  size: string;
  /** The image type its bytes are in; null for a file that is not an image. */
  mediaType: ImageMediaType | null;
  /** A blob URL of the preview, for images. */
  url: string | null;
  bytes: Blob;
};

const IMAGE_MEDIA_TYPES = new Set<ImageMediaType>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function asImageMediaType(value: string): ImageMediaType | null {
  return IMAGE_MEDIA_TYPES.has(value as ImageMediaType) ? (value as ImageMediaType) : null;
}

/** "820 KB", "2.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(1, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let nextAttachment = 1;

/** The chip a file becomes. `name` falls back for pasted images without one. */
export function attachmentFromFile(
  file: Blob & { name?: string },
  name = file.name ?? t("chat.attachmentFallback"),
): Attachment {
  const mediaType = asImageMediaType(file.type);
  const url =
    mediaType && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : null;
  return {
    id: `att-${nextAttachment++}`,
    name,
    size: formatBytes(file.size),
    mediaType,
    url,
    bytes: file,
  };
}

/** Adds a chip unless the same file is already on the composer. */
export function addAttachment(
  list: readonly Attachment[],
  next: Attachment,
): readonly Attachment[] {
  const duplicate = list.some(
    (item) =>
      item.name === next.name && item.size === next.size && item.mediaType === next.mediaType,
  );
  return duplicate ? list : [...list, next];
}

export function removeAttachment(list: readonly Attachment[], id: string): readonly Attachment[] {
  return list.filter((item) => item.id !== id);
}

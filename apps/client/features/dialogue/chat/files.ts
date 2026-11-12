/**
 * Files the composer takes from outside the app: the system's file picker,
 * a paste, a drop. Their bytes stay in the app; only a sent file leaves.
 *
 * A drop or a paste of files copied in Finder hands over `file:` URLs, whose
 * bytes are read through `fs`; `nsh.json` grants reads of the app's own data
 * only, so a path from the user's folders is refused (`ERR_ACCESS_DENIED`)
 * and `attachDropped` takes the same files through the open dialog instead.
 */
import fs from "fs/promises";

/** The name a `file:` URL ends with, percent-decoded. */
export function nameFromUrl(url: string): string {
  const path = decodeURIComponent(url.replace(/^file:(\/\/)?/, "").replace(/\/+$/, ""));
  const at = path.lastIndexOf("/");
  const name = at >= 0 ? path.slice(at + 1) : path;
  return name || "Attachment";
}

/** A rough MIME type from a file name, for a drop that reports none. */
export function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    case "json":
      return "application/json";
    default:
      return "";
  }
}

/** The file a dropped or pasted `file:` URL names, ready to attach. */
export async function fileFromUrl(url: string, mediaType = ""): Promise<File> {
  const path = decodeURIComponent(url.replace(/^file:(\/\/)?/, ""));
  const bytes = await fs.readFile(path);
  const name = nameFromUrl(url);
  const type = mediaType || mimeFromName(name);
  return new File([bytes], name, type ? { type } : undefined);
}

/** The files a set of `file:` URLs names, and the names whose bytes did not come. */
export async function filesFromUrls(
  uris: readonly string[],
  types: readonly string[] = [],
): Promise<{ files: File[]; unread: string[] }> {
  const files: File[] = [];
  const unread: string[] = [];
  for (const [index, uri] of uris.entries()) {
    try {
      files.push(await fileFromUrl(uri, types[index] ?? ""));
    } catch {
      unread.push(nameFromUrl(uri));
    }
  }
  return { files, unread };
}

/** A Blob's bytes as base64, what a prompt's image part carries. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

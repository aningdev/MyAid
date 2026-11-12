import { expect, test } from "nsh/test";

import {
  addAttachment,
  asImageMediaType,
  attachmentFromFile,
  formatBytes,
  removeAttachment,
  type Attachment,
} from "./attachments";

function blob(type: string, size = 2048): Blob & { name?: string } {
  const bytes = new Uint8Array(size);
  const file = new Blob([bytes], { type }) as Blob & { name?: string };
  return file;
}

function chip(id: string, name = `${id}.png`): Attachment {
  return { id, name, size: "2 KB", mediaType: "image/png", url: null, bytes: blob("image/png") };
}

test("only the image types dsh takes are image parts", () => {
  expect(asImageMediaType("image/png")).toBe("image/png");
  expect(asImageMediaType("image/gif")).toBe("image/gif");
  expect(asImageMediaType("application/pdf")).toBe(null);
  expect(asImageMediaType("image/tiff")).toBe(null);
});

test("sizes read in bytes, kilobytes and megabytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(2048)).toBe("2 KB");
  expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
});

test("a file becomes a chip with its name, size and image type", () => {
  const attachment = attachmentFromFile(blob("image/png"), "cat.png");
  expect(attachment.name).toBe("cat.png");
  expect(attachment.size).toBe("2 KB");
  expect(attachment.mediaType).toBe("image/png");
  expect(attachment.id.startsWith("att-")).toBe(true);

  const pdf = attachmentFromFile(blob("application/pdf", 20), "notes.pdf");
  expect(pdf.mediaType).toBe(null);
  expect(pdf.url).toBe(null);
});

test("the same file is on the composer once", () => {
  const first = chip("a");
  const same = { ...chip("b"), name: first.name, size: first.size, mediaType: first.mediaType };
  const list = addAttachment(addAttachment([], first), same);
  expect(list.map((item) => item.id)).toEqual(["a"]);
  const other = chip("c", "other.png");
  expect(addAttachment(list, other).map((item) => item.id)).toEqual(["a", "c"]);
  expect(removeAttachment(addAttachment(list, other), "a").map((item) => item.id)).toEqual(["c"]);
});

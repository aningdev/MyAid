import { expect, test } from "nsh/test";

import { displayPath, middleEllipsis, pathSegment, trimPath } from "./paths";

test("a path under home reads as ~/…; other paths stay as dsh reports them", () => {
  expect(displayPath("/Users/ada/proj-b", "/Users/ada")).toBe("~/proj-b");
  expect(displayPath("/Users/ada", "/Users/ada")).toBe("~");
  expect(displayPath("/Users/ada/", "/Users/ada")).toBe("~");
  expect(displayPath("/work/myaid", "/Users/ada")).toBe("/work/myaid");
  expect(displayPath("/Users/adam/proj", "/Users/ada")).toBe("/Users/adam/proj");
  expect(displayPath("", "/Users/ada")).toBe("");
});

test("middle ellipsis keeps the prefix and the leaf inside its budget", () => {
  const path = "~/Code/MyAid-l2/apps/client/.myaid-smoke/proj-b";
  const short = middleEllipsis(path, 30);
  expect(short.length).toBe(30);
  expect(short.startsWith("~/Code/")).toBe(true);
  expect(short.endsWith("proj-b")).toBe(true);
  expect(short).toContain("…");
  expect(middleEllipsis("/short", 30)).toBe("/short");
});

test("the old path helpers keep their spelling", () => {
  expect(trimPath("/work/myaid/")).toBe("/work/myaid");
  expect(trimPath("/")).toBe("/");
  expect(pathSegment("/work/myaid/")).toBe("myaid");
  expect(pathSegment("/")).toBe("/");
});

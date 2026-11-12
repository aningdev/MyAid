import { expect, test } from "nsh/test";

import { DIGIT_WIDTH, LIST_INDENT, orderedListIndent } from "./markdownLists";

function list(count: number): string {
  return Array.from({ length: count }, (_, index) => `${index + 1}. Item ${index + 1}.`).join("\n");
}

test("a list that stops at nine keeps the default indent", () => {
  expect(orderedListIndent("")).toBe(null);
  expect(orderedListIndent(list(9))).toBe(null);
  expect(orderedListIndent("- one\n- two\n* three")).toBe(null);
});

test("ten or more widens the marker column by one digit", () => {
  expect(orderedListIndent(list(10))).toBe(LIST_INDENT + DIGIT_WIDTH);
  expect(orderedListIndent(list(22))).toBe(LIST_INDENT + DIGIT_WIDTH);
  expect(orderedListIndent(list(99))).toBe(LIST_INDENT + DIGIT_WIDTH);
});

test("three digits widen it again, and the largest index decides", () => {
  // A document that jumps to 120 numbers three digits with two items.
  expect(orderedListIndent("1. one\n120. many")).toBe(LIST_INDENT + 2 * DIGIT_WIDTH);
  expect(orderedListIndent(list(120))).toBe(LIST_INDENT + 2 * DIGIT_WIDTH);
});

test("the widest marker wins across every list and depth", () => {
  const nested = ["1. one", "   1. nested", "   12. nested twelve", "2. two"].join("\n");
  expect(orderedListIndent(nested)).toBe(LIST_INDENT + DIGIT_WIDTH);
});

test("only list markers count, not numbers in prose or in code", () => {
  expect(orderedListIndent("Read 12. Then stop.")).toBe(null);
  expect(orderedListIndent("```\n10. not a list\n```")).toBe(null);
  // A fence closes: what follows is a list again.
  expect(orderedListIndent("```\n10. code\n```\n10. real item")).toBe(LIST_INDENT + DIGIT_WIDTH);
});

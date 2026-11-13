/**
 * The one catalog, checked as data: every key has both languages, neither is
 * empty, and a translation keeps every `{placeholder}` the other language
 * fills (a dropped `{name}` would show half a sentence at runtime).
 */
import { expect, test } from "nsh/test";

import { messages, type MessageKey } from "./messages";

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]!).sort();
}

test("every key has 简体中文 and English, neither empty", () => {
  const empty: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    if (!value.zh.trim()) empty.push(`${key}.zh`);
    if (!value.en.trim()) empty.push(`${key}.en`);
  }
  expect(empty).toEqual([]);
  expect(Object.keys(messages).length).toBeGreaterThan(250);
});

test("a key fills the same placeholders in both languages", () => {
  const mismatched: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    const zh = placeholders(value.zh).join(",");
    const en = placeholders(value.en).join(",");
    if (zh !== en) mismatched.push(`${key}: zh {${zh}} vs en {${en}}`);
  }
  expect(mismatched).toEqual([]);
});

test("the count pairs the code picks between have the same shape", () => {
  const pairs: [MessageKey, MessageKey][] = [
    ["nav.unread.one", "nav.unread.other"],
    ["chat.steps.one", "chat.steps.other"],
  ];
  for (const [one, other] of pairs) {
    expect(placeholders(messages[one].en)).toEqual(placeholders(messages[other].en));
    expect(placeholders(messages[one].zh)).toEqual(placeholders(messages[other].zh));
  }
});

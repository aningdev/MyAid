import { expect, test } from "nsh/test";

import { clockLabel, dayKey, dayLabel, elapsedLabel, elapsedSeconds } from "./time";

const NOW = new Date(2026, 2, 12, 15, 4).getTime();
const DAY = 24 * 60 * 60 * 1000;

test("a day's label reads Today, Yesterday, or its date", () => {
  expect(dayLabel(NOW, NOW)).toBe("Today");
  expect(dayLabel(NOW - DAY, NOW)).toBe("Yesterday");
  expect(dayLabel(new Date(2026, 0, 4, 9, 0).getTime(), NOW)).toBe("Jan 4");
  expect(dayLabel(new Date(2025, 0, 4, 9, 0).getTime(), NOW)).toBe("Jan 4, 2025");
});

test("two times on one calendar day share a key", () => {
  const morning = new Date(2026, 2, 12, 8, 0).getTime();
  expect(dayKey(morning)).toBe(dayKey(NOW));
  expect(dayKey(NOW - DAY)).not.toBe(dayKey(NOW));
});

test("a message's time reads as hours and minutes", () => {
  expect(clockLabel(new Date(2026, 2, 12, 9, 5).getTime())).toBe("9:05");
  expect(clockLabel(new Date(2026, 2, 12, 14, 30).getTime())).toBe("14:30");
});

test("elapsed time reads in seconds, then minutes", () => {
  expect(elapsedSeconds(NOW, NOW + 2500)).toBe(2);
  expect(elapsedSeconds(NOW + 1000, NOW)).toBe(0);
  expect(elapsedLabel(8)).toBe("8s");
  expect(elapsedLabel(60)).toBe("1m");
  expect(elapsedLabel(65)).toBe("1m 05s");
  expect(elapsedLabel(85)).toBe("1m 25s");
});

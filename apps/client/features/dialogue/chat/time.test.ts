import { expect, test } from "nsh/test";

import { t } from "../../../lib/i18n";
import { clockLabel, dayKey, dayLabel, elapsedLabel, elapsedSeconds } from "./time";

const NOW = new Date(2026, 2, 12, 15, 4).getTime();
const DAY = 24 * 60 * 60 * 1000;

test("a day's label reads Today, Yesterday, or its date", () => {
  expect(dayLabel(NOW, NOW)).toBe("Today");
  expect(dayLabel(NOW - DAY, NOW)).toBe("Yesterday");
  expect(dayLabel(new Date(2026, 0, 4, 9, 0).getTime(), NOW)).toBe(
    t("time.dateThisYear", { month: t("time.month.jan"), day: 4 }),
  );
  expect(dayLabel(new Date(2025, 0, 4, 9, 0).getTime(), NOW)).toBe(
    t("time.dateOtherYear", { month: t("time.month.jan"), day: 4, year: 2025 }),
  );
});

test("two times on one calendar day share a key", () => {
  const morning = new Date(2026, 2, 12, 8, 0).getTime();
  expect(dayKey(morning)).toBe(dayKey(NOW));
  expect(dayKey(NOW - DAY)).not.toBe(dayKey(NOW));
});

test("a message's time follows the system's hour cycle", () => {
  // The headless user is en-US: a 12-hour clock with AM / PM.
  expect(clockLabel(new Date(2026, 2, 12, 9, 5).getTime())).toBe(t("time.am", { time: "9:05" }));
  expect(clockLabel(new Date(2026, 2, 12, 14, 30).getTime())).toBe(t("time.pm", { time: "2:30" }));
});

test("elapsed time reads in seconds, then minutes", () => {
  expect(elapsedSeconds(NOW, NOW + 2500)).toBe(2);
  expect(elapsedSeconds(NOW + 1000, NOW)).toBe(0);
  expect(elapsedLabel(8)).toBe(t("time.seconds", { seconds: 8 }));
  expect(elapsedLabel(60)).toBe(t("time.minutes", { minutes: 1 }));
  expect(elapsedLabel(65)).toBe(t("time.minutesSeconds", { minutes: 1, seconds: "05" }));
  expect(elapsedLabel(85)).toBe(t("time.minutesSeconds", { minutes: 1, seconds: "25" }));
});

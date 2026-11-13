/**
 * Days, clock times and elapsed labels for the transcript. Pure, so the
 * separators and the hovered times are testable without a screen. The words
 * and the date order come from the catalog (`lib/i18n`); the clock follows
 * the system's 12- or 24-hour setting.
 */
import { localeSettings } from "nsh";

import { t, type MessageKey } from "../../../lib/i18n";

const MONTHS: readonly MessageKey[] = [
  "time.month.jan",
  "time.month.feb",
  "time.month.mar",
  "time.month.apr",
  "time.month.may",
  "time.month.jun",
  "time.month.jul",
  "time.month.aug",
  "time.month.sep",
  "time.month.oct",
  "time.month.nov",
  "time.month.dec",
];

/** A local calendar day, as a key two times on it share. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today", "Yesterday", "Mar 4" / "3月4日", or the same with the year. */
export function dayLabel(at: number, now: number): string {
  const key = dayKey(at);
  if (key === dayKey(now)) return t("time.today");
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return t("time.yesterday");
  const date = new Date(at);
  const month = t(MONTHS[date.getMonth()] ?? "time.month.jan");
  const day = date.getDate();
  return date.getFullYear() === new Date(now).getFullYear()
    ? t("time.dateThisYear", { month, day })
    : t("time.dateOtherYear", { month, day, year: date.getFullYear() });
}

/** A message's time of day: "14:05", or "2:05 PM" where the system says so. */
export function clockLabel(at: number): string {
  const date = new Date(at);
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const cycle = localeSettings().hourCycle;
  if (cycle === "h11" || cycle === "h12") {
    const hours = date.getHours();
    const hour = hours % 12 === 0 ? 12 : hours % 12;
    const time = `${hour}:${minutes}`;
    return t(hours < 12 ? "time.am" : "time.pm", { time });
  }
  return `${date.getHours()}:${minutes}`;
}

/** Whole seconds since `since`, never negative. */
export function elapsedSeconds(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** "8s", "1m 05s", "12m" / "8 秒", "1 分 05 秒", "12 分". */
export function elapsedLabel(seconds: number): string {
  if (seconds < 60) return t("time.seconds", { seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0
    ? t("time.minutes", { minutes })
    : t("time.minutesSeconds", { minutes, seconds: String(rest).padStart(2, "0") });
}

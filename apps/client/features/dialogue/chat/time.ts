/**
 * Days, clock times and elapsed labels for the transcript. Pure, so the
 * separators and the hovered times are testable without a screen.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A local calendar day, as a key two times on it share. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today", "Yesterday", "Mar 3", or "Mar 3, 2025" for another year. */
export function dayLabel(at: number, now: number): string {
  const key = dayKey(at);
  if (key === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return "Yesterday";
  const date = new Date(at);
  const month = MONTHS[date.getMonth()] ?? "";
  return date.getFullYear() === new Date(now).getFullYear()
    ? `${month} ${date.getDate()}`
    : `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

/** A message's time of day, "14:05". */
export function clockLabel(at: number): string {
  const date = new Date(at);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Whole seconds since `since`, never negative. */
export function elapsedSeconds(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** "8s", "1m 05s", "12m". */
export function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

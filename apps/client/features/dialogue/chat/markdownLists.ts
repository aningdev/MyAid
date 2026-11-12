/**
 * The indent an ordered list's markers need, as a `TextView` style value.
 * Pure: the transcript's Markdown measures its lists here, and the rule is
 * tested without a screen.
 */

/** `TextView`'s own list indent, in points: what a one-digit marker sits over. */
export const LIST_INDENT = 20;

/** What one more digit of a marker takes, at the chat's 15 pt scale. */
export const DIGIT_WIDTH = 9;

/**
 * The largest ordered-list index a document numbers, looking only at lines
 * that start a list item outside a fenced code block.
 */
function largestIndex(md: string): number {
  let largest = 0;
  let fenced = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    // A marker at any depth: `1.` / `2)` after the spaces that indent a level.
    const marker = /^\s{0,12}(\d{1,9})[.)]\s/.exec(line);
    if (!marker) continue;
    const index = Number(marker[1]);
    if (index > largest) largest = index;
  }
  return largest;
}

/**
 * `paddingLeft` for `orderedList`, measured for the largest index the
 * document numbers: nsh's indent holds one digit, so a reply that counts to
 * 10 or more clips the first digit of `10.`, `11.` … (the marker is
 * right-aligned in the indent, and the part past it is cut).
 *
 * `null` when no ordered marker reaches two digits: the default indent holds
 * every marker, and the list keeps nsh's own indentation.
 */
export function orderedListIndent(md: string): number | null {
  const largest = largestIndex(md);
  const digits = largest >= 10 ? String(largest).length : 1;
  return digits > 1 ? LIST_INDENT + (digits - 1) * DIGIT_WIDTH : null;
}

// The name screen readers say of a control whose content is a text label: the caller's
// `accessibilityLabel` if it gave one, else the string child. Owned by this library: the shells
// share one rule rather than writing it out again in each.
import type { JSX } from "nsh";

/**
 * What screen readers say of `props`: `accessibilityLabel` when the caller gave one (an explicit
 * `null` included, which names nothing), else the string child, else `undefined` — content drawn
 * as given (`<Button><Icon /></Button>`) derives no name, so a control that is only an icon asks
 * for one on its props (`IconButton`).
 */
export function labelOf(
  accessibilityLabel: string | null | undefined,
  children: string | JSX.Element | undefined,
): string | null | undefined {
  if (accessibilityLabel !== undefined) return accessibilityLabel;
  return typeof children === "string" && children !== "" ? children : undefined;
}

// The small tools the shells share: a look's value read where it is applied (`Live`/`read`), the
// name a control gives screen readers (`labelOf`), and how an app's part classes meet ours
// (`mergeClasses`/`joinClass`). It is this library's `lib/utils.ts`, as shadcn's is the one file
// an app's components take their shared helpers from.
import type { JSX } from "nsh";

/**
 * A value, or a function reading it where the look is applied (a signal): read at draw time, a
 * signal's value stays live.
 */
export type Live<T> = T | (() => T);

/** `v`, read where it is applied: the value itself, or what its accessor returns then. */
export const read = <T>(v: Live<T> | undefined): T | undefined =>
  typeof v === "function" ? (v as () => T)() : v;

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

/**
 * `consumer` over `base`, part by part: a string goes after ours, `null` drops ours, and a part it
 * leaves out (or `undefined`) keeps ours.
 */
export function mergeClasses<C extends { [K in keyof C]?: string | null }>(
  base: C,
  consumer?: C | null,
): C {
  if (consumer == null) return base;
  const merged: C = { ...base };
  for (const key of Object.keys(consumer) as (keyof C)[]) {
    const next = consumer[key];
    if (next === undefined) continue;
    if (next === null) {
      delete merged[key];
      continue;
    }
    const prior = merged[key];
    merged[key] = (prior ? `${prior} ${next}` : next) as C[keyof C]; // `next` is the string the type allows
  }
  return merged;
}

/**
 * `base`'s classes with `extra`'s after them: no `extra` keeps `base` as it is, and a `base` that
 * is absent leaves `extra` alone (a part with no default class of its own).
 */
export function joinClass(base: string, extra?: string | null): string;
export function joinClass(
  base: string | null | undefined,
  extra?: string | null,
): string | undefined;
export function joinClass(
  base: string | null | undefined,
  extra?: string | null,
): string | undefined {
  const prior = base ?? undefined;
  const next = extra ?? undefined;
  if (prior && next) return `${prior} ${next}`;
  return next ?? prior;
}

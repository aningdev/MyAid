/**
 * A mark's change of form: the body's shape and the face give way to the next
 * ones over a quarter of a second, easing out — an exponential approach, not a
 * spring, so it never overshoots and never wobbles.
 *
 * This book is the one owner of what a mark was and when it began to change; a
 * frame asks it what to draw and keeps nothing itself. The first form a mark
 * wears is not a change: a picker's cell appears wearing its form, and only a
 * press that gives it another one is a morph. Reduced motion cuts: the new form
 * is simply the one drawn.
 */
import type { AvatarForm, AvatarFormChange } from "./avatar";

/** How the change eases out: about 250 ms to look finished (1 − e^−t/83). */
const EASE_MS = 83;

/** A form past this is drawn as reached: about 250 ms, the last twentieth unshown. */
const DONE = 0.95;

/** One mark's change of form, kept from frame to frame. */
export type FormBook = {
  /**
   * What to draw at `now` for the form the mark wears: the one it is coming
   * from and how far the change has got, or `null` when nothing is changing.
   * `instant` cuts straight to the new form (reduced motion).
   */
  at(form: AvatarForm, now: number, instant: boolean): AvatarFormChange | null;
};

/** A book for one mark. A component keeps it for as long as it is on screen. */
export function formBook(): FormBook {
  /** The form now worn, and the one it is coming from while the change runs. */
  let shown: AvatarForm | null = null;
  let before: AvatarForm | null = null;
  let beganAt = 0;

  return {
    at(form, now, instant) {
      if (shown === null || shown.shape !== form.shape || shown.face !== form.face) {
        before = shown;
        shown = { shape: form.shape, face: form.face };
        beganAt = now;
        // The form a mark appears in is what it is, not a change from nothing.
        if (before === null || instant) {
          before = null;
          return null;
        }
        return { ...before, progress: 0 };
      }
      if (before === null) return null;
      const progress = 1 - Math.exp(-(now - beganAt) / EASE_MS);
      if (!(progress < DONE)) {
        before = null;
        return null;
      }
      return { ...before, progress };
    },
  };
}

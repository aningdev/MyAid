import { computed, platform, windowSize } from "nsh";
import { titleBar } from "nsh/desktop";

/**
 * Desktop chrome when the window is wide enough (gallery rule): ≥700 pt on
 * desktop idiom, ≥900 pt elsewhere.
 */
export const isDesktopLayout = computed(
  () => windowSize().width >= (platform.idiom === "desktop" ? 700 : 900),
);

/** Compact hidden title-bar height passed to `Window.setTitleBar` (≤44 → macOS compact). */
export const TITLE_CHROME = 40;

/**
 * Top inset for full-width chrome (narrow title strip / Win caption pad).
 * True fullscreen reports titleBar all 0 — return 0 (no fake strip).
 * Windowed: at least TITLE_CHROME so content clears the controls.
 */
export function titleTopInset(): number {
  const { height, left, right } = titleBar();
  if (height === 0 && left === 0 && right === 0) return 0;
  return Math.max(height, TITLE_CHROME);
}

/**
 * Top inset for the desktop NavRail under a hidden title bar.
 * Always reserves TITLE_CHROME: `titleBar()` can briefly (or while
 * fullscreen-hover lights show) report 0, and a 12pt fallback lets the
 * first module icon sit under the traffic lights.
 */
export function railTopInset(): number {
  return Math.max(titleBar().height, TITLE_CHROME);
}

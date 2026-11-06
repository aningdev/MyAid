import { computed, platform, windowSize } from "nsh";
import { titleBar } from "nsh/desktop";

/** Wide enough for desktop Navigator | Workbench (≥700 pt desktop idiom). */
export const isDesktopLayout = computed(
  () => windowSize().width >= (platform.idiom === "desktop" ? 700 : 900),
);

/** Compact hidden title-bar height for `Window.setTitleBar`. */
export const TITLE_CHROME = 40;

/** Top inset under hidden title bar / caption buttons. */
export function titleTopInset(): number {
  const { height, left, right } = titleBar();
  if (height === 0 && left === 0 && right === 0) return 0;
  return Math.max(height, TITLE_CHROME);
}

import { computed, platform, signal, untracked, windowSize } from "nsh";
import { titleBar } from "nsh/desktop";

/** Wide enough for desktop shell (≥700 pt desktop idiom). */
export const isDesktopLayout = computed(
  () => windowSize().width >= (platform.idiom === "desktop" ? 700 : 900),
);

/** Hidden title-bar height for `Window.setTitleBar`. Matches the sidebar header. */
export const TITLE_CHROME = 44;

/** Left navigator width for this run. Default matches the gallery sidebar. */
export const NAV_DEFAULT_WIDTH = 232;
export const NAV_MIN_WIDTH = 160;
export const NAV_MAX_WIDTH = 480;

/** Top inset under hidden title bar / caption buttons. */
export function titleTopInset(): number {
  const { height, left, right } = titleBar();
  if (height === 0 && left === 0 && right === 0) return 0;
  return Math.max(height, TITLE_CHROME);
}

/** Left navigator open. Collapsed state keeps a 44pt drag strip over the workbench. */
const navOpenState = signal(true);

/** Last dragged width. Session-only; restored the next time the navigator opens. */
const navWidthState = signal(NAV_DEFAULT_WIDTH);

export function navWidth() {
  return navWidthState();
}

export function setNavWidth(width: number) {
  navWidthState.set(width);
}

export function navOpen() {
  return navOpenState();
}

export function setNavOpen(open: boolean) {
  navOpenState.set(open);
}

export function toggleNavOpen() {
  navOpenState.set(!untracked(navOpenState));
}

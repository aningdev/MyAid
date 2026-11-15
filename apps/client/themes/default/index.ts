// The build-time theme (the library's own) as one `AppTheme`: the same tokens and finishes an app
// built on another theme does not have, for it to switch back to while it runs (`selectTheme`,
// `currentTheme`). `shadcn-nsh add theme-default` copies this directory into the app's
// `themes/default/`; it is the app's, then, to change. Copies of `packages/theme/{theme,finishes}.json`,
// which `scripts/theme/themes.test.ts` holds byte for byte.
import type { AppTheme } from "../../lib/theme";

import finishes from "./finishes.json";
import theme from "./theme.json";

/** The gallery's own look (the citrus accent, the graphite surfaces, the 10-point controls) as a
 * theme: what an app built on another one switches back to. */
export const defaultTheme: AppTheme = {
  id: "default",
  label: "NSH Gallery UI",
  theme,
  finishes,
};

export default defaultTheme;

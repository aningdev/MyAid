/**
 * Path spellings the Workspace code shares: dsh stores canonical paths, while
 * a person types trailing slashes and `~`. One helper, so a Workspace found by
 * path and the title dsh derives from it cannot disagree.
 */
import { homedir } from "os";

/** A path without its trailing slashes (the root keeps its own spelling). */
export function trimPath(path: string): string {
  const trimmed = path.trim();
  const bare = trimmed.replace(/\/+$/, "");
  return bare.length > 0 ? bare : trimmed;
}

/** The final segment of a path: dsh's default Workspace title. */
export function pathSegment(path: string): string {
  const trimmed = trimPath(path);
  const at = trimmed.lastIndexOf("/");
  return at >= 0 ? trimmed.slice(at + 1) || trimmed : trimmed;
}

/**
 * How a path reads in the UI: under the person's home it starts with `~/`
 * (the spec's 「今天 · ~/proj-b」), and every other path stays as dsh reports
 * it. The full path remains the value the product acts on and the tooltips
 * show.
 */
export function displayPath(path: string, home: string = homedir()): string {
  const trimmed = trimPath(path);
  if (!trimmed) return "";
  const root = trimPath(home);
  if (!root || root === "/") return trimmed;
  if (trimmed === root) return "~";
  return trimmed.startsWith(`${root}/`) ? `~${trimmed.slice(root.length)}` : trimmed;
}

/**
 * A path shortened in the middle, keeping both the home prefix and the leaf:
 * a hover card is narrow, while the beginning says where and the end which
 * directory. The full path stays on the element's accessibility label and the
 * header / divider tooltips.
 */
export function middleEllipsis(value: string, max = 44): string {
  if (value.length <= max) return value;
  const room = max - 1;
  const head = Math.ceil(room / 2);
  const tail = Math.floor(room / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

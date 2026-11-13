/**
 * Path spellings the Workspace code shares: dsh stores canonical paths, while
 * a person types trailing slashes and `~`. One helper, so a Workspace found by
 * path and the title dsh derives from it cannot disagree.
 */

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

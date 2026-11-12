import type { IconName } from "../ui";
import type { NavKind } from "./types";

/** The glyph that stands for a Navigator node (and a Panel's address). */
export function navKindIcon(kind: NavKind | "section"): IconName {
  switch (kind) {
    case "favorite":
      return "star";
    case "bot":
      return "spark";
    case "dialogue":
      return "chat";
    case "session":
      return "code";
    case "setting":
      return "sliders";
    case "space":
      return "sidebar";
    case "folder":
      return "folder";
    case "section":
      return "lists";
  }
}

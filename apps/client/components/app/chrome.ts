/**
 * The thumb of a resize handle (`handleThumbClass`), as gpui-component draws
 * it: none at rest, so the hairlines stay quiet; a faint pill grows in under
 * the pointer, and a long solid one while pressed or dragged.
 */
export const handleThumb =
  "h-11 w-[3px] rounded-full bg-muted-foreground opacity-0 scale-y-0 transition duration-150 ease-out group-hover:opacity-40 group-hover:scale-y-[0.45] group-active:opacity-90 group-active:scale-y-100";

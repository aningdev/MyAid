import { type JSX, signal, token } from "nsh";

import { TextView, type TextViewImage } from "../../../components/ui/text-view";
import { t } from "../../../lib/i18n";
import { ImageViewer } from "../ImageViewer";
import { orderedListIndent } from "./markdownLists";

/**
 * A reply's Markdown, shown by `TextView` at a chat's scale (its default
 * typography otherwise, in the theme's colors).
 *
 * Aligned with `references/nsh/examples/gallery/demos/chat/markdown.tsx`.
 *
 * While a reply streams (`streaming`), syntax its end leaves open shows as
 * if closed and only the block being written renders again; `caret` is
 * drawn at the end of the last block, inline with its text.
 *
 * Every block (and each list item and table cell) is one selectable text:
 * a long press highlights it and offers Copy. Code blocks carry
 * `TextView`'s built-in copy action. A press on an image opens it in an
 * `ImageViewer` (mounted on the first press, kept for its fade out).
 *
 * An ordered list that counts past 9 renders with its marker column
 * measured (`orderedListIndent`): nsh's fixed indent clipped the first
 * digit of `10.` and up.
 */
export function Markdown(props: {
  md: string;
  id: string;
  streaming?: boolean;
  caret?: JSX.Element;
}) {
  const viewing = signal<TextViewImage | null>(null);
  const used = signal(false);
  /** `orderedList`'s style, only where the default indent would clip a marker. */
  const listStyle = () => {
    const indent = orderedListIndent(props.md);
    return indent === null ? {} : { orderedList: { paddingLeft: indent } };
  };
  return (
    <>
      <TextView
        markdown={props.md}
        options={{ streaming: !!props.streaming }}
        selectable
        codeBlockScrollbar={false}
        streamingCaret={props.caret}
        styles={{
          // A chat's scale: tighter than a document's. (gallery Chat demo)
          root: { gap: 12, fontSize: 15, lineHeight: 22, color: token("foreground") },
          heading1: { fontSize: 20, lineHeight: 26 },
          heading2: { fontSize: 17, lineHeight: 22 },
          heading3: { fontSize: 15, lineHeight: 22 },
          code: { color: token("code") },
          codeBlockCode: { color: token("code") },
          // Measured, not fixed: a list that reaches 10 needs a wider marker
          // column than one that stops at 9.
          ...listStyle(),
        }}
        codeBlockActions={[{ id: "copy", label: t("chat.copyCode") }]}
        onImagePress={(event) => {
          used.set(true);
          viewing.set(event.image);
        }}
      />
      {used() ? <ImageViewer image={viewing()} onClose={() => viewing.set(null)} /> : null}
    </>
  );
}

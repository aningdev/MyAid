// Text view: the link and caret classes, and the `TextView` that wears them.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { split } from "nsh";
import {
  TextView as BaseTextView,
  type TextViewClasses,
  type TextViewDocument,
  type TextViewImage,
  type TextViewProps as BaseTextViewProps,
  type TextViewRef,
} from "nsh/base";

import { mergeClasses } from "../../lib/utils";

/** A `TextView`'s links (its `classes`): the brand color over a faint
 * underline of it. */
export const textViewLinkClasses = { link: "text-brand decoration-brand/40" };

/** A streaming `TextView`'s caret (a view of this class, its
 * `streamingCaret`): a brand-colored block a line high that pulses. */
export const textViewCaretClass = "ml-0.5 h-4 w-2 animate-pulse rounded-sm bg-brand";

/** Every prop of `nsh/base` TextView; parsing stays in base. */
export type TextViewProps = BaseTextViewProps;

/** The view the static parsers are attached to, so the export below carries them. */
function TextViewRoot(props: TextViewProps) {
  const [, rest] = split(props, ["classes", "class", "style"]);
  return (
    <BaseTextView
      {...rest}
      class={props.class}
      style={props.style}
      classes={mergeClasses<TextViewClasses>(textViewLinkClasses, props.classes)}
    />
  );
}

/** A Markdown, HTML or block document. */
export const TextView = Object.assign(TextViewRoot, {
  // Bound: these are methods of the base export, and detaching one loses its receiver.
  parse: BaseTextView.parse.bind(BaseTextView),
  parseHtml: BaseTextView.parseHtml.bind(BaseTextView),
  plainText: BaseTextView.plainText.bind(BaseTextView),
});

/** A document as `TextView.parse` returns it, from `nsh/base`. */
export type { TextViewDocument };

/** The classes of a text view's parts, from `nsh/base`. */
export type { TextViewClasses };

/** An image of a document (`renderImage`, `onImagePress`), from `nsh/base`. */
export type { TextViewImage };

/** A text view's ref, from `nsh/base`. */
export type { TextViewRef };

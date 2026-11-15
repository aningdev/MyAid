// Text view: link classes and the `TextView` that wears them.
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

/** A `TextView`'s links (its `classes`): the brand color over a faint
 * underline of it. */
export const textViewLinkClasses = { link: "text-brand decoration-brand/40" };

/** A streaming `TextView`'s caret (a view of this class, its
 * `streamingCaret`): a brand-colored block a line high that pulses. */
export const textViewCaretClass = "ml-0.5 h-4 w-2 animate-pulse rounded-sm bg-brand";

function mergeClasses(base: TextViewClasses, extra?: TextViewClasses | null): TextViewClasses {
  if (extra == null) return base;
  const merged = { ...base };
  for (const key of Object.keys(extra) as (keyof TextViewClasses)[]) {
    const next = extra[key];
    if (next === undefined) continue;
    if (next === null) {
      delete merged[key];
      continue;
    }
    const prior = merged[key];
    merged[key] = prior ? `${prior} ${next}` : next;
  }
  return merged;
}

/** Theme layer on `nsh/base` TextView. Parsing stays in base. */
export type TextViewProps = BaseTextViewProps;

function View(props: TextViewProps) {
  const [, rest] = split(props, ["classes", "class", "style"]);
  return (
    <BaseTextView
      {...rest}
      class={props.class}
      style={props.style}
      classes={mergeClasses(textViewLinkClasses, props.classes)}
    />
  );
}

/** A Markdown, HTML or block document. */
export const TextView = Object.assign(View, {
  // Bound: these are methods of the base export, and detaching one loses its receiver.
  parse: BaseTextView.parse.bind(BaseTextView),
  parseHtml: BaseTextView.parseHtml.bind(BaseTextView),
  plainText: BaseTextView.plainText.bind(BaseTextView),
});

export type { TextViewDocument };

/** The classes of a text view's parts, from `nsh/base`. */
export type { TextViewClasses };

/** An image of a document (`renderImage`, `onImagePress`), from `nsh/base`. */
export type { TextViewImage };

/** A text view's ref, from `nsh/base`. */
export type { TextViewRef };

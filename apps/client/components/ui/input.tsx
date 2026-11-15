// An input: the look (`inputLook` and its companions) and the `Input` that wears it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, finish, radius, terminal, TERMINAL_COLUMN, TERMINAL_ROW } from "../../lib/theme";
import type { InputStyle, ViewStyle } from "nsh";
import { platform, split } from "nsh";
import { Input as BaseInput, type InputProps as BaseInputProps } from "nsh/base";

const pointer = platform.desktop;

/** A value, or a function reading it where the look is applied (a signal). */
type Live<T> = T | (() => T);

const read = <T,>(v: Live<T> | undefined): T | undefined =>
  typeof v === "function" ? (v as () => T)() : v;

/**
 * A text field's sizes, shared by every single-line field and picker
 * trigger (an input, a number input, a select, a combobox, a palette's
 * trigger): 32 points high, text 14 and 10 points in from its edges with a
 * pointer (shadcn's `text-sm`); 46 high, text 15 and 14 in on a touch screen. In the
 * terminal a field is three rows (its border's and the text's), the text one
 * Cell inside the border's own column.
 */
export const fieldSize = terminal
  ? { height: 3 * TERMINAL_ROW, font: 13, pad: 2 * TERMINAL_COLUMN - 1 }
  : pointer
    ? { height: 32, font: 14, pad: 10 }
    : { height: 46, font: 15, pad: 14 };

/** Options of `fieldLook` and `inputLook`. */
export interface FieldLookOptions {
  /**
   * `default`: the field's fill and edge. `ghost`: nothing at rest — no fill, no edge — with
   * the text and the placeholder as they are and the focus ring kept (a search field, a title
   * that turns into a field); disabled and invalid still show.
   */
  variant?: Live<InputVariant | undefined>;
  /** Edged in the danger tone, its focus edge too. */
  invalid?: Live<boolean>;
  /** Read-only: lies flat (no recess) on a quieter edge. */
  readonly?: Live<boolean>;
  /** Disabled: flat on the quieter edge, as read-only; `disabledStyle` dims it. */
  disabled?: Live<boolean>;
  /** Several lines: the content starts at the top. */
  multiline?: boolean;
  /** Layout over the look (a width, a height, a margin; on an input its text too), or a function reading it. */
  style?: Live<InputStyle>;
}

/** Options of `edgeClass`. */
interface EdgeOptions {
  /** The edge at rest: a border color class (`border-input`). */
  rest: string;
  /** The edge under the pointer (`border-faint`), none for a field that takes no hover. */
  hover?: string;
  /** The variant the hover takes (`hover`, `enabled:hover`). */
  hoverVariant?: string;
  /** The focus tone: the accent, or the danger tone while invalid. */
  invalid?: boolean;
  /**
   * `focus:` for a well that has the keys itself, `focus-within:` (the default) for one around what has them,
   * `focus-visible:` for a button drawn as a field (its focus shows only after a key).
   */
  focus?: "focus" | "focus-within" | "focus-visible";
}

/**
 * A well's edge as classes: at rest, stronger under the pointer, and while
 * it (or a view in it) has the keys a 2-point edge in the accent, the
 * border and the outline together, hovered or not; in the terminal the
 * border is the field's line, so it takes the accent alone.
 */
export function edgeClass(o: EdgeOptions): string {
  const tone = o.invalid ? "destructive" : "brand";
  const focus = o.focus ?? "focus-within";
  const hover = o.hoverVariant ?? "hover";
  return [
    o.rest,
    o.hover ? `${hover}:${o.hover} ${hover}:${focus}:border-${tone}` : "",
    `${focus}:border-${tone}`,
    terminal ? "" : `outline-2 -outline-offset-1 outline-${tone}/0 ${focus}:outline-${tone}`,
    "transition-colors duration-150 motion-reduce:transition-none",
  ]
    .filter(Boolean)
    .join(" ");
}

/** A field's variants: `default` the field's fill and edge, `ghost` neither until the keys are in it. */
export type InputVariant = "default" | "ghost";

/**
 * A field's edge: the danger tone while invalid, the line (no hover) while read-only or disabled,
 * and nothing at rest while `ghost` (its focus edge, from `edgeClass`, stays).
 */
function fieldEdge(o: FieldLookOptions | undefined): string {
  const invalid = !!read(o?.invalid);
  const ghost = (read(o?.variant) ?? "default") === "ghost";
  const flat = !!read(o?.readonly) || !!read(o?.disabled);
  if (invalid) return edgeClass({ rest: "border-destructive", invalid });
  if (ghost) return edgeClass({ rest: "border-transparent" });
  return flat
    ? edgeClass({ rest: "border-line" })
    : edgeClass({ rest: "border-input", hover: "border-faint" });
}

function frame(o: FieldLookOptions | undefined): ViewStyle {
  const ghost = (read(o?.variant) ?? "default") === "ghost";
  const flat = !!read(o?.readonly) || !!read(o?.disabled);
  return {
    borderRadius: radius.control,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: ghost ? "transparent" : colors.field,
    // Recessed while editable; a read-only, disabled or ghost field lies flat. Its edge is
    // `fieldEdge`'s classes.
    ...(flat || ghost ? {} : finish.field),
  };
}

/**
 * The well around a field's input (and its prefix, suffix, icons): spread
 * it on the view holding them. Its states (`class`): a stronger edge under
 * the pointer (none while invalid, read-only or disabled), the focus edge
 * while the input in it has the keys; 50% while disabled.
 */
export function fieldLook(o?: FieldLookOptions) {
  return {
    get class(): string {
      return fieldEdge(o);
    },
    get style(): InputStyle {
      return {
        flexDirection: "row",
        alignItems: o?.multiline ? "flex-start" : "center",
        ...frame(o),
        ...read(o?.style),
      };
    },
    disabledStyle: { opacity: 0.5 } as ViewStyle,
  };
}

/** Options of `fieldText`. */
export interface FieldTextOptions {
  /** Read-only: the value keeps the text color, as shadcn's read-only input (the well lies flat: `fieldLook`). */
  readonly?: boolean;
  /** Several lines: a least height and the padding above and below instead of a set height. */
  multiline?: boolean;
  /** Inside a `fieldLook` well, whose 1-point edge is part of the field's height: the text is that much shorter, so the
   * whole field is as tall as a lone input, a select or a number input. */
  inWell?: boolean;
}

/**
 * An input's text in a field: the field's size and padding, the text color
 * (read-only too: the flat well tells it apart, and disabled dims to 50%),
 * the placeholder in the muted color (shadcn's `muted-foreground`), the
 * caret and selection in the accent. Call it where the style is read, so it
 * follows the theme.
 */
export function fieldText(o?: FieldTextOptions): InputStyle {
  // The well's edge above and below.
  const edge = o?.inWell && !terminal ? 2 : 0;
  const box = terminal
    ? o?.multiline
      ? {
          minHeight: 3 * TERMINAL_ROW,
          paddingTop: TERMINAL_ROW - 1,
          paddingBottom: TERMINAL_ROW - 1,
        }
      : { height: 3 * TERMINAL_ROW }
    : o?.multiline
      ? pointer
        ? {
            minHeight: fieldSize.height - edge,
            paddingTop: 7 - edge / 2,
            paddingBottom: 7 - edge / 2,
          }
        : {
            minHeight: fieldSize.height - edge,
            paddingTop: 13 - edge / 2,
            paddingBottom: 13 - edge / 2,
          }
      : { height: fieldSize.height - edge };
  return {
    flex: 1,
    paddingHorizontal: fieldSize.pad,
    fontSize: fieldSize.font,
    color: colors.text,
    placeholderColor: colors.muted,
    caretColor: colors.accent,
    selectionColor: colors.accent,
    ...box,
  };
}

/**
 * A lone `<Input>`'s props (`<Input {...inputLook()} />`): the well and its
 * states (`fieldLook`) and the text in it (`fieldText`) on the input itself.
 */
export function inputLook(o?: FieldLookOptions) {
  const look = fieldLook(o);
  return {
    get class(): string {
      return look.class;
    },
    get style(): InputStyle {
      const text = fieldText({ readonly: !!read(o?.readonly), multiline: o?.multiline });
      return { ...frame(o), ...text, flex: undefined, ...read(o?.style) } as InputStyle;
    },
    disabledStyle: look.disabledStyle,
  };
}

/**
 * A time field's well (`DatePicker`'s `timeFieldClass`): a number input's, its segments inside. It sits in the
 * calendar's popup, so in dark it is shadcn's input there (`bg-input/30`, a shade over the popup) rather than the
 * field color, which is the page's and would read as a hole.
 */
export const timeFieldClass = [
  pointer ? "h-8 rounded-[7px] px-2" : "h-11 rounded-lg px-3",
  terminal ? "items-center border bg-field" : "items-center border bg-field dark:bg-input/30",
  edgeClass({ rest: "border-input", hover: "border-faint", hoverVariant: "enabled:hover" }),
].join(" ");

/**
 * `nsh/base`'s Input in the look of `inputLook`. Every base prop passes through; `class`, `style`
 * and `disabledStyle` go over the look's. Focus and hover edges are classes on the look.
 */
export type InputProps = BaseInputProps & {
  /** Default `default`: the field's fill and edge. `ghost`: nothing at rest, the focus ring kept. */
  variant?: InputVariant;
  /** Edged in the danger tone, its focus edge too. */
  invalid?: boolean;
};

/** A text field. The well and the text are `inputLook`. */
export function Input(props: InputProps) {
  const [, rest] = split(props, ["variant", "invalid", "class", "style", "disabledStyle"]);
  const look = inputLook({
    variant: () => props.variant,
    invalid: () => !!props.invalid,
    readonly: () => !!props.readonly,
    disabled: () => !!props.disabled,
    multiline: props.multiline,
  });
  return (
    <BaseInput
      {...rest}
      class={props.class ? `${look.class} ${props.class}` : look.class}
      style={[look.style, props.style ?? null]}
      disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
    />
  );
}

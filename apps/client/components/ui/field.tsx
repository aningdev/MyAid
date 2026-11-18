// A field: the look (`fieldFamilyLook`) and the ten parts that wear it.
// This library's own: upstream has no field family, so the parts and their axes follow shadcn/ui and
// the look is written from the theme's roles. Yours to change.
import { colors, TERMINAL_ROW, terminal } from "../../lib/theme";
import type { JSX, TextStyle, TextProps, ViewProps, ViewStyle } from "nsh";
import { context, split, Text, View } from "nsh";

import { controlSize, density, narrowWindow } from "../../lib/surface";

/**
 * How a field lays its label and its control out: `vertical` (the label over
 * the control), `horizontal` (beside it, the label taking the room the
 * control leaves) or `responsive` (vertical in a narrow window — a phone, or
 * a narrow desktop one — horizontal in a wide one).
 */
export type FieldOrientation = "vertical" | "horizontal" | "responsive";

/** A legend's type: `legend` over a set of fields, one step smaller as `label` over a group of choices. */
export type FieldLegendVariant = "legend" | "label";

/** What `Field` tells its parts: whether the row is horizontal right now (reactive). */
type FieldContextValue = { horizontal: () => boolean };

/** The `Field` a part is in, or none (a `FieldLabel` outside one takes the vertical look). */
const FieldContext = context<FieldContextValue | null>(null);

/** A `Field`'s parts as the styles they wear: spread each one. */
export interface FieldFamilyLook {
  /** The set of fields: a column, 16 points apart (one row in the terminal). */
  readonly set: ViewStyle;
  /** A group of fields in a set: a column, 16 points apart too, its fields stretched across. */
  readonly group: ViewStyle;
  /** A field: `horizontal` puts the label and the control on one row. */
  field(horizontal: boolean): ViewStyle;
  /** The label and its description beside a control: a column that takes the room left. */
  readonly content: ViewStyle;
  /** A set's legend, one step larger than a field's label. */
  legend(variant: FieldLegendVariant): TextStyle;
  /** A control's label, in the vertical look (as wide as its text). */
  readonly title: TextStyle;
  /** A field's label in a row: as wide as its text, never squeezed thinner than it (the control
   * beside it takes the room left, `content`'s `minWidth: 0`), which on a narrow phone would cut
   * it mid-word. */
  readonly labelInRow: TextStyle;
  readonly description: TextStyle;
  readonly separator: ViewStyle;
  readonly separatorLine: ViewStyle;
  readonly separatorText: TextStyle;
  readonly error: ViewStyle;
  readonly errorRow: ViewStyle;
  readonly errorText: TextStyle;
  /** An error's message beside its bullet: it wraps rather than running past the field, which a
   * long sentence would in a narrow window (`flexShrink: 1`, `minWidth: 0`). */
  readonly errorMessage: TextStyle;
}

/** The gap between a set's fields: 16 points, or one row in the terminal. */
const setGap = terminal ? TERMINAL_ROW : 16;

/** The gap between a label and the control under it: 8 points (none in the terminal, whose rows are one row each). */
const labelGap = terminal ? 0 : 8;

/** The gap between a label and the control beside it. */
const rowGap = 12;

/**
 * A field family's look, after shadcn/ui's secondary `Field`, written from the
 * theme's roles: a set of fields 16 points apart under its legend (a step
 * larger than a label, in the text colour, medium weight), each field a label
 * and its control 8 points apart (`vertical`) or 12 points apart and on one
 * row (`horizontal`), and a description and an error in the quieter size
 * (`density.note`) — the description muted, the error in the danger tone. A
 * separator is a hairline, or a hairline broken by its label. `responsive`
 * reads the window through `narrowWindow`, so it is vertical below 600 points
 * and horizontal above.
 */
export function fieldFamilyLook(): FieldFamilyLook {
  // Read where it is drawn, as every part below: a look kept in a `const` follows the scheme.
  const label = (): TextStyle => ({
    fontSize: controlSize.label,
    fontWeight: "500",
    color: colors.text,
  });
  return {
    get set(): ViewStyle {
      return {
        flexDirection: "column",
        gap: setGap,
        width: "100%",
      };
    },
    get group(): ViewStyle {
      return {
        flexDirection: "column",
        alignItems: "stretch",
        gap: setGap,
        width: "100%",
      };
    },
    field: (horizontal: boolean): ViewStyle =>
      horizontal
        ? {
            flexDirection: "row",
            alignItems: "center",
            gap: rowGap,
            width: "100%",
          }
        : {
            flexDirection: "column",
            alignItems: "stretch",
            gap: labelGap,
            width: "100%",
          },
    get content(): ViewStyle {
      return { flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: "column", gap: 4 };
    },
    legend: (variant: FieldLegendVariant): TextStyle => ({
      ...label(),
      fontSize: variant === "legend" ? controlSize.label + 1 : controlSize.label,
    }),
    get title(): TextStyle {
      return { ...label(), alignSelf: "flex-start" };
    },
    get labelInRow(): TextStyle {
      return { ...label(), flexShrink: 0 };
    },
    get description(): TextStyle {
      return { fontSize: density.note, color: colors.muted };
    },
    get separator(): ViewStyle {
      return {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: terminal ? TERMINAL_ROW : 20,
      };
    },
    get separatorLine(): ViewStyle {
      return { flexGrow: 1, height: 1, backgroundColor: colors.line };
    },
    get separatorText(): TextStyle {
      return { fontSize: density.note, color: colors.muted };
    },
    get error(): ViewStyle {
      return { flexDirection: "column", gap: 2 };
    },
    get errorRow(): ViewStyle {
      return { flexDirection: "row", alignItems: "flex-start", gap: 6 };
    },
    get errorText(): TextStyle {
      return { fontSize: density.note, color: colors.danger };
    },
    get errorMessage(): TextStyle {
      return { fontSize: density.note, color: colors.danger, flexShrink: 1, minWidth: 0 };
    },
  };
}

/** A set of related fields, under its `FieldLegend`. Every view prop passes through. */
export type FieldSetProps = ViewProps;

/**
 * A set's legend, `variant="legend"` (default) over a set of fields or
 * `variant="label"` over a group of choices.
 */
export type FieldLegendProps = TextProps & {
  /** Default `legend`; `label` is one step smaller. */
  variant?: FieldLegendVariant;
};

/** A group of fields in a set. Every view prop passes through. */
export type FieldGroupProps = ViewProps;

/** A field: its label and its control. */
export type FieldProps = ViewProps & {
  /** Default `vertical`; `responsive` is vertical in a narrow window and horizontal in a wide one. */
  orientation?: FieldOrientation;
};

/** A label and its description, beside a control in a horizontal field. */
export type FieldContentProps = ViewProps;

/**
 * A field's label, for the control it names. It is text, not a `<label>`: NSH
 * has no label association, so a screen reader hears the control's own
 * `accessibilityLabel` (see the page).
 */
export type FieldLabelProps = TextProps;

/** A title over a group of choices, where the label is not one control's. */
export type FieldTitleProps = TextProps;

/** A quieter line under a label: what the field expects. */
export type FieldDescriptionProps = TextProps;

/** A hairline between fields, or a hairline broken by a word. */
export type FieldSeparatorProps = ViewProps;

/** A field's error messages, read out where the platform does it by itself. */
export type FieldErrorProps = ViewProps & {
  /** The messages to show when `children` says nothing; a repeated message shows once. */
  errors?: Array<{ message?: string } | undefined>;
};

/** A set of related fields. */
export function FieldSet(props: FieldSetProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    <View {...rest} role="group" style={[fieldFamilyLook().set, props.style ?? null]}>
      {props.children}
    </View>
  );
}

/** A set's legend: `variant="legend"` (default) or `variant="label"`. */
export function FieldLegend(props: FieldLegendProps) {
  const [, rest] = split(props, ["variant", "style", "children"]);
  return (
    <Text
      {...rest}
      style={[fieldFamilyLook().legend(props.variant ?? "legend"), props.style ?? null]}
    >
      {props.children}
    </Text>
  );
}

/** A group of fields in a set. */
export function FieldGroup(props: FieldGroupProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    <View {...rest} style={[fieldFamilyLook().group, props.style ?? null]}>
      {props.children}
    </View>
  );
}

/** A field: a label and its control, `vertical` unless `orientation` says otherwise. */
export function Field(props: FieldProps) {
  const [, rest] = split(props, ["orientation", "style", "children"]);
  // Read where it is drawn, so a field that turns horizontal follows `orientation`.
  const horizontal = () => {
    const orientation = props.orientation ?? "vertical";
    return orientation === "horizontal" || (orientation === "responsive" && !narrowWindow());
  };
  return (
    <FieldContext.Provider value={{ horizontal }}>
      <View
        {...rest}
        role="group"
        style={[fieldFamilyLook().field(horizontal()), props.style ?? null]}
      >
        {props.children}
      </View>
    </FieldContext.Provider>
  );
}

/** A label and its description, beside the control in a horizontal field. */
export function FieldContent(props: FieldContentProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    // A label inside the content is already in a column: it takes the width it
    // is given, not the room a control leaves.
    <FieldContext.Provider value={{ horizontal: () => false }}>
      <View {...rest} style={[fieldFamilyLook().content, props.style ?? null]}>
        {props.children}
      </View>
    </FieldContext.Provider>
  );
}

/** A field's label: it takes the room the control leaves in a horizontal field. */
export function FieldLabel(props: FieldLabelProps) {
  const [, rest] = split(props, ["style", "children"]);
  // Read here, where the label is drawn: a window that crosses 600 points moves it.
  const horizontal = () => FieldContext()?.horizontal() ?? false;
  return (
    <Text
      {...rest}
      style={[
        horizontal() ? fieldFamilyLook().labelInRow : fieldFamilyLook().title,
        props.style ?? null,
      ]}
    >
      {props.children}
    </Text>
  );
}

/** A title over a group of choices. */
export function FieldTitle(props: FieldTitleProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    <Text {...rest} style={[fieldFamilyLook().title, props.style ?? null]}>
      {props.children}
    </Text>
  );
}

/** A quieter line under a label. */
export function FieldDescription(props: FieldDescriptionProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    <Text {...rest} style={[fieldFamilyLook().description, props.style ?? null]}>
      {props.children}
    </Text>
  );
}

/** A hairline between fields; with children, a hairline broken by its word. */
export function FieldSeparator(props: FieldSeparatorProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    <View {...rest} style={[fieldFamilyLook().separator, props.style ?? null]}>
      <If when={props.children != null} else={<View style={fieldFamilyLook().separatorLine} />}>
        <View style={fieldFamilyLook().separatorLine} />
        <Text style={fieldFamilyLook().separatorText}>{props.children}</Text>
        <View style={fieldFamilyLook().separatorLine} />
      </If>
    </View>
  );
}

/** A field's error: `errors`' messages, or `children`; read out by the platform where it can. */
export function FieldError(props: FieldErrorProps) {
  const [, rest] = split(props, ["style", "children", "errors"]);
  /** The distinct messages, in the order they came. */
  const messages = () => {
    const seen = new Set<string>();
    for (const error of props.errors ?? []) if (error?.message) seen.add(error.message);
    return [...seen];
  };
  const content = (): JSX.Element => {
    if (props.children != null) return props.children;
    const list = messages();
    if (list.length === 1) return <Text style={fieldFamilyLook().errorText}>{list[0]}</Text>;
    return (
      <Each of={list} key={(message: string) => message}>
        {(message) => (
          <View style={fieldFamilyLook().errorRow}>
            <Text style={fieldFamilyLook().errorText}>•</Text>
            <Text style={fieldFamilyLook().errorMessage}>{message()}</Text>
          </View>
        )}
      </Each>
    );
  };
  if (props.children == null && messages().length === 0) return null;
  return (
    <View
      {...rest}
      role="alert"
      // macOS and the web read a `role="alert"` by themselves; TalkBack reads
      // this change through the live region (`docs` of the field page).
      android={{ accessibilityLiveRegion: "assertive" }}
      style={[fieldFamilyLook().error, props.style ?? null]}
    >
      {content()}
    </View>
  );
}

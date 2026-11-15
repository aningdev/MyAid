/**
 * A group's control that keeps its ref: `InputGroupInput` and `InputGroupTextarea` hold the ref
 * themselves (the group puts the keys in them from an addon) and take none, so a group whose
 * control must be focused or written to from code cannot use them. This draws `nsh/base`'s input
 * in the group's own control look (`inputGroupControlLook`, which the input-group page gives for
 * "a `nsh/base` control of your own"), so the group still draws the field and its one ring.
 *
 * A gap for shadcn-nsh (shadcn's `InputGroupInput` forwards its ref): reported, not patched here.
 */
import { type InputRef, type InputStyle, split } from "nsh";
import { Input as BaseInput, type InputProps as BaseInputProps } from "nsh/base";

import { inputGroupControlLook } from "../ui/input-group";

/** A group's single-line control, with the ref the group's own parts do not give. */
export type GroupInputProps = Omit<BaseInputProps, "ref"> & {
  /** The input, for `focus`, `blur`, `setSelection` and `insertText`. */
  ref?: InputRef | ((ref: InputRef) => void);
};

export function GroupInput(props: GroupInputProps) {
  const [, rest] = split(props, ["style", "ref"]);
  const look = inputGroupControlLook({ multiline: !!props.multiline });
  return <BaseInput {...rest} ref={props.ref} style={[look.style, props.style ?? null]} />;
}

/** A group's control over several lines, with the ref the group's own parts do not give. */
export type GroupTextareaProps = Omit<BaseInputProps, "ref" | "multiline"> & {
  /** The input, for `focus`, `blur`, `setSelection` and `insertText`. */
  ref?: InputRef | ((ref: InputRef) => void);
  /** More style over the look's (a height, a text style). */
  style?: InputStyle;
};

export function GroupTextarea(props: GroupTextareaProps) {
  const [, rest] = split(props, ["style", "ref"]);
  const look = inputGroupControlLook({ multiline: true });
  return (
    <BaseInput {...rest} ref={props.ref} multiline style={[look.style, props.style ?? null]} />
  );
}

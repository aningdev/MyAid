/**
 * A segmented choice given as options: shadcn-nsh's `Segmented` parts, with
 * the choices as data. Every place that picks one of a few labels writes the
 * same three parts otherwise, and a choice is not a component of its own
 * shadcn-nsh has: `Segmented` takes a list and its items, never a shorthand.
 */
import { Segmented, SegmentedItem, SegmentedList, type SegmentedSize } from "../ui/segmented";

/** One choice: what it sets, and what it says. */
export type SegmentedOption = {
  value: string;
  label: string;
};

export type OptionSegmentedProps = {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** The segments share the row (default: as wide as their labels). */
  fill?: boolean;
  size?: SegmentedSize;
  testID?: string;
};

/** A segmented control over `options`, with `value` selected. */
export function OptionSegmented(props: OptionSegmentedProps) {
  return (
    <Segmented value={props.value} onValueChange={props.onValueChange}>
      <SegmentedList fill={props.fill} size={props.size} testID={props.testID}>
        <Each of={props.options}>
          {(option) => <SegmentedItem value={option().value}>{option().label}</SegmentedItem>}
        </Each>
      </SegmentedList>
    </Segmented>
  );
}

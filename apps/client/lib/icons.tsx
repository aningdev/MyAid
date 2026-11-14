// Icons: lucide's nodes drawn on a canvas, and the check mark as one color's SVG.
// It replaces NSH's examples/nsh-gallery-ui icons.tsx (Apache-2.0, © Longbridge; see NOTICE): the
// glyphs are gone, the icons come from `lucide` as a front end imports them (`docs/specs/lucide.md`).
import { terminal } from "./theme";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, type IconNode } from "lucide";
import { Canvas, Image, Path2D, Text } from "nsh";

import { drawIcon, type IconCanvas } from "./icon-canvas";

/** lucide's box: 24 units square, and the unit `weight` is measured in. */
const BOX = 24;

/** lucide's own stroke: 2 of the box's 24 units, round ends and joins. */
const WEIGHT = 2;

/** SVG path data parsed once per `d` (an icon is redrawn whenever it lays out). */
const parsed = new Map<string, Path2D>();

/** The path for `d`: the platform parses the SVG data the first time an icon needs it. */
function pathOf(d: string) {
  let path = parsed.get(d);
  if (!path) {
    path = new Path2D(d);
    parsed.set(d, path);
  }
  return path;
}

/** The icons that point along the line (forward, back): mirrored from right to left. */
const directional: ReadonlySet<IconNode> = new Set<IconNode>([
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowRight,
]);

/** What `Icon` draws: a lucide node, the side of its box, and the color and weight of its stroke. */
export type IconProps = {
  /** The icon itself, as lucide exports it (`import { ChevronDown } from "lucide"`). */
  icon: IconNode;
  /** The side of its square, in points (20 by default). */
  size?: number;
  /** Its color: the stroke, and the fill when `fill` is set. */
  tint: string;
  /** The stroke in the icon's 24-unit box (2 by default, lucide's own). */
  weight?: number;
  /** Fill the shape in `tint` instead of stroking it (a solid icon, such as `Play`). */
  fill?: boolean;
};

/**
 * An icon, stroked in `tint` at `size`: a lucide node drawn in its 24-unit box, so it reads the
 * same size and weight as everywhere else lucide is used. In the terminal, which draws no icons,
 * a check is a mark (`✓`); any other icon shows nothing there.
 */
export function Icon(props: IconProps) {
  const size = props.size ?? 20;
  // The terminal draws no icons; a check is a mark there too (a chosen
  // option, the command in effect, a step done), so it keeps its glyph.
  if (terminal && props.icon === Check) return <Text style={{ color: props.tint }}>✓</Text>;
  return (
    <Canvas
      class={directional.has(props.icon) ? "rtl:-scale-x-100" : undefined}
      style={{ pointerEvents: "none", width: size, height: size }}
      draw={(cx, { width }) => {
        cx.scale(width / BOX, width / BOX);
        cx.strokeStyle = props.tint;
        cx.fillStyle = props.tint;
        cx.lineWidth = props.weight ?? WEIGHT;
        cx.lineCap = "round";
        cx.lineJoin = "round";
        drawIcon(props.icon, cx as IconCanvas<Path2D>, {
          fill: props.fill,
          path: pathOf,
        });
      }}
    />
  );
}

/**
 * An icon-only control's content: the icon, or in the terminal, which draws
 * no icons, `label` as text in the icon's tint (a short word: the control's
 * accessibility label keeps its full name).
 */
export function IconLabel(props: { label: string } & Omit<IconProps, "fill">) {
  return terminal ? (
    <Text style={{ color: props.tint }}>{props.label}</Text>
  ) : (
    <Icon icon={props.icon} size={props.size} tint={props.tint} weight={props.weight} />
  );
}

/** One element of a lucide node as an SVG element, for the check mark's image. */
const svgElement = (tag: string, attrs: IconNode[number][1]) =>
  `<${tag} ${Object.entries(attrs)
    .filter(([, value]) => value != null)
    .map(([name, value]) => `${name}="${String(value)}"`)
    .join(" ")}/>`;

/**
 * lucide's `Check` as an SVG in one color, recolored by `tintColor`: `#000` is the image's
 * template ink, never what is drawn (the P3 exemption in `ui-guards.test.ts`).
 */
const checkSvg = (weight: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX}" height="${BOX}" viewBox="0 0 ${BOX} ${BOX}" fill="none" stroke="#000" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${Check.map(([tag, attrs]) => svgElement(tag, attrs)).join("")}</svg>`,
  )}`;

/** A check mark drawn as SVG, in `tint`; `weight` is the stroke in its 24-unit box (2 by default). */
export function CheckMark(props: { size?: number; tint: string; weight?: number }) {
  const size = props.size ?? 20;
  return (
    <Image
      src={checkSvg(props.weight ?? WEIGHT)}
      style={{ pointerEvents: "none", width: size, height: size, tintColor: props.tint }}
    />
  );
}

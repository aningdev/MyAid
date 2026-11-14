// The elements of a lucide icon, drawn on a canvas: a `Path2D` per path, an arc or lines for the
// rest. Apart from `icons.tsx`, and free of imports, so the unit test can watch what it draws with
// a recorder instead of NSH (`docs/specs/lucide.md`).
import type { IconNode } from "lucide";

/** One element of an `IconNode`: its tag and its SVG attributes. */
export type IconElement = IconNode[number];

/** How a path's SVG data becomes something the canvas can stroke or fill. */
export type IconPathOf<P> = (d: string) => P;

/**
 * The canvas calls an icon makes (a `CanvasRenderingContext2D` subset, so the two agree), with
 * `P` whatever a stroke's path is: the platform's `Path2D` in the app, a note of the data in a test.
 */
export interface IconCanvas<P> {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  roundRect(x: number, y: number, w: number, h: number, radius?: number): void;
  stroke(path?: P): void;
  fill(path?: P): void;
}

/** A full turn, the end angle of a closed circle or an ellipse. */
const TURN = Math.PI * 2;

/** The shapes lucide writes besides paths and point lines. */
const SHAPES: ReadonlySet<string> = new Set(["circle", "ellipse", "rect", "line"]);

/** An attribute as a number: lucide writes them as strings. */
const number = (attrs: IconElement[1], name: string, fallback = 0) => {
  const value = attrs[name];
  return value == null ? fallback : Number(value);
};

/** A `points` attribute as flat x, y coordinates. */
const coordinates = (attrs: IconElement[1]) => {
  const value = String(attrs.points ?? "").trim();
  return value === "" ? [] : value.split(/[\s,]+/).map(Number);
};

/** One element, on a path of its own: stroked, or filled in the same color (`fill`). */
function drawElement<P>(
  tag: string,
  attrs: IconElement[1],
  canvas: IconCanvas<P>,
  options: { fill: boolean; path: IconPathOf<P> },
) {
  const paint = () => (options.fill ? canvas.fill() : canvas.stroke());

  // A path is drawn from its own data, which the platform parses.
  if (tag === "path") {
    const d = String(attrs.d ?? "");
    if (d === "") return;
    const drawn = options.path(d);
    if (options.fill) canvas.fill(drawn);
    else canvas.stroke(drawn);
    return;
  }

  // A line through points, closed for a polygon: too few of them draw nothing.
  if (tag === "polyline" || tag === "polygon") {
    const points = coordinates(attrs);
    if (points.length < 4) return;
    canvas.beginPath();
    canvas.moveTo(points[0], points[1]);
    for (let i = 2; i + 1 < points.length; i += 2) canvas.lineTo(points[i], points[i + 1]);
    if (tag === "polygon") canvas.closePath();
    paint();
    return;
  }

  // A shape with a curve of its own. Anything else (lucide has no other tags) draws nothing.
  if (!SHAPES.has(tag)) return;
  canvas.beginPath();
  switch (tag) {
    case "circle":
      canvas.arc(number(attrs, "cx"), number(attrs, "cy"), number(attrs, "r"), 0, TURN);
      break;
    case "ellipse":
      canvas.ellipse(
        number(attrs, "cx"),
        number(attrs, "cy"),
        number(attrs, "rx"),
        number(attrs, "ry"),
        0,
        0,
        TURN,
      );
      break;
    case "rect":
      // lucide's rects carry one radius, `rx` (`ry` repeats it): a rounded corner on all four.
      canvas.roundRect(
        number(attrs, "x"),
        number(attrs, "y"),
        number(attrs, "width"),
        number(attrs, "height"),
        number(attrs, "rx", number(attrs, "ry")),
      );
      break;
    default:
      canvas.moveTo(number(attrs, "x1"), number(attrs, "y1"));
      canvas.lineTo(number(attrs, "x2"), number(attrs, "y2"));
      break;
  }
  paint();
}

/**
 * Draws `icon` (a lucide `IconNode`) with canvas calls, each element on a path of its own:
 * stroked, or filled in the same color with `fill` (the solid icons, such as `Play`). `path` says
 * how a `d` becomes a drawable path: `new Path2D(d)` in the app, a recorder's note in a test.
 */
export function drawIcon<P>(
  icon: IconNode,
  canvas: IconCanvas<P>,
  options: { fill?: boolean; path: IconPathOf<P> },
): void {
  const fill = options.fill === true;
  for (const [tag, attrs] of icon) drawElement(tag, attrs, canvas, { fill, path: options.path });
}

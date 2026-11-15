/**
 * MyAid's own little character: a body in the Bot's accent, with two eyes cut
 * out of it. The body is one closed radial profile per shape — the same 64
 * angles for every shape, normalized so all eight read at one size — and the
 * eyes are holes, so whatever stands behind the mark shows through them.
 *
 * The eyes follow the shape's real outline. An expression is placed in the
 * shape's own face frame, then shrunk until every part of it clears the
 * contour by a margin (`avatarFor`), which is what keeps the eyes whole on the
 * narrow shapes — triangle, drop, star, dome — instead of letting the mark
 * clip them.
 *
 * Batch B animates this: `drawAvatarFrame` already takes the frame's `time`,
 * and `BotAvatar` passes it. Today it is 0, so every frame is the same one.
 */
import type { BotFace, BotShape } from "./identity";

/** The angles every body shares, so a later batch can morph between them. */
export const AVATAR_SAMPLES = 64;

/** How much of the body's radius the eyes keep clear of: the visible rim. */
export const AVATAR_RIM = 0.11;

/** The eye weight at a mark's usual sizes, in body radii. */
const EYE_WEIGHT = 0.09;

type Pt = { x: number; y: number };

const TAU = Math.PI * 2;

/** One eye, in body radii: its center from the mark's center, and its own shape. */
export type AvatarEye =
  | { kind: "dot"; x: number; y: number; rx: number; ry: number }
  | { kind: "arc"; x: number; y: number; radius: number; from: number; to: number }
  | { kind: "line"; x: number; y: number; length: number };

/** What to draw for one identity at one size, already fitted to the body. */
export type AvatarGeometry = {
  /** The body's radius at each of `AVATAR_SAMPLES` angles, the longest 1. */
  profile: readonly number[];
  eyes: readonly AvatarEye[];
  /** The eyes' stroke, in body radii (dots are filled, so it is theirs alone). */
  weight: number;
};

/** A frame of the character: everything `drawAvatarFrame` needs, nothing reactive. */
export type AvatarFrame = {
  shape: BotShape;
  face: BotFace;
  /** The body's fill. */
  color: string;
  /** The mark's side in points. */
  size: number;
  /** Milliseconds since the mark appeared; the platform of a later batch. */
  time?: number;
};

/* -------------------------------------------------------------------------
 * Bodies
 * ---------------------------------------------------------------------- */

/** One shape's profile: 64 radii at the shared angles, the longest 1. */
const profiles = new Map<BotShape, readonly number[]>();

export function shapeProfile(shape: BotShape): readonly number[] {
  const cached = profiles.get(shape);
  if (cached) return cached;
  const outline = outlineOf(shape);
  const samples: number[] = [];
  for (let i = 0; i < AVATAR_SAMPLES; i++) {
    const angle = (i / AVATAR_SAMPLES) * TAU;
    samples.push(rayHit(outline, Math.cos(angle), Math.sin(angle)));
  }
  const longest = Math.max(...samples);
  const profile = samples.map((radius) => radius / longest);
  profiles.set(shape, profile);
  return profile;
}

/** The body's radius at `angle`, read off a profile it was not sampled at. */
export function radiusAtAngle(profile: readonly number[], angle: number): number {
  const turns = (((angle / TAU) % 1) + 1) % 1;
  const position = turns * profile.length;
  const index = Math.floor(position) % profile.length;
  const next = (index + 1) % profile.length;
  const between = position - Math.floor(position);
  return (profile[index] ?? 0) * (1 - between) + (profile[next] ?? 0) * between;
}

/**
 * The shape's outline as a dense closed polyline, in its own units and the
 * canvas's axes (y down). Every shape is star-shaped around the origin, so one
 * ray meets it once and the profile above can be read from it.
 */
function outlineOf(shape: BotShape): Pt[] {
  switch (shape) {
    case "round":
      return circle({ x: 0, y: 0 }, 1, 96);
    case "square":
      // A superellipse: a square whose corners have been taken in by a curve.
      return superellipse(1, 1, 4, 192);
    case "pebble":
      // Three low harmonics: irregular, but every turn of it is smooth.
      return radial(
        (angle) =>
          1 +
          0.11 * Math.cos(2 * angle + 0.6) +
          0.07 * Math.cos(3 * angle - 1.3) +
          0.04 * Math.cos(5 * angle + 2.1),
        192,
      );
    case "triangle":
      return roundedPolygon(
        [
          { x: 0, y: -1 },
          { x: 0.92, y: 0.68 },
          { x: -0.92, y: 0.68 },
        ],
        0.34,
      );
    case "dome":
      return dome();
    case "drop":
      return drop();
    case "flower":
      // The union of four overlapping circles, sampled where the union's edge is.
      return radial(petalRadius, 192);
    case "star": {
      // Four points on the axes, four notches between them, every corner soft.
      const points: Pt[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = -Math.PI / 2 + (i / 8) * TAU;
        const reach = i % 2 === 0 ? 1 : 0.44;
        points.push({ x: Math.cos(angle) * reach, y: Math.sin(angle) * reach });
      }
      return roundedPolygon(points, 0.12);
    }
  }
}

function circle(center: Pt, radius: number, steps: number): Pt[] {
  return arcPoints(center, radius, 0, TAU, steps);
}

function superellipse(a: number, b: number, exponent: number, steps: number): Pt[] {
  const power = 2 / exponent;
  const points: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push({
      x: a * Math.sign(cos) * Math.abs(cos) ** power,
      y: b * Math.sign(sin) * Math.abs(sin) ** power,
    });
  }
  return points;
}

/** A closed outline sampled from a radius that is a function of the angle. */
function radial(radius: (angle: number) => number, steps: number): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * TAU;
    const length = radius(angle);
    points.push({ x: Math.cos(angle) * length, y: Math.sin(angle) * length });
  }
  return points;
}

/** A polygon whose corners are arcs: the straight runs between them stay. */
function roundedPolygon(vertices: readonly Pt[], radius: number): Pt[] {
  const points: Pt[] = [];
  const count = vertices.length;
  for (let i = 0; i < count; i++) {
    const vertex = vertices[i]!;
    const previous = vertices[(i - 1 + count) % count]!;
    const next = vertices[(i + 1) % count]!;
    const toPrevious = unit(subtract(previous, vertex));
    const toNext = unit(subtract(next, vertex));
    const corner = Math.acos(clamp(dotOf(toPrevious, toNext), -1, 1));
    if (corner < 1e-3) {
      points.push(vertex);
      continue;
    }
    // How far down each edge the arc starts, kept inside both edges' halves.
    const tangent = Math.tan(corner / 2);
    const room = Math.min(distance(previous, vertex), distance(next, vertex)) / 2;
    const reach = Math.min(radius / tangent, room);
    const turn = reach * tangent;
    const start = add(vertex, times(toPrevious, reach));
    const end = add(vertex, times(toNext, reach));
    const center = add(vertex, times(unit(add(toPrevious, toNext)), turn / Math.sin(corner / 2)));
    const from = Math.atan2(start.y - center.y, start.x - center.x);
    const to = Math.atan2(end.y - center.y, end.x - center.x);
    points.push(...arcPoints(center, turn, from, shortestSweep(from, to), 12));
  }
  return points;
}

/** A bread roll: a semicircular top over straight sides and a flat, soft bottom. */
function dome(): Pt[] {
  const half = 0.85;
  const shoulder = 0.02;
  const bottom = 0.62;
  const corner = 0.18;
  const points: Pt[] = [];
  // Over the top, from the left shoulder to the right one.
  points.push(...arcPoints({ x: 0, y: shoulder }, half, Math.PI, Math.PI, 48));
  // Down the right side, round its foot and along the bottom, then up the left.
  const foot = { x: half - corner, y: bottom - corner };
  points.push(
    ...arcPoints(foot, corner, 0, Math.PI / 2, 12),
    ...arcPoints({ x: -foot.x, y: foot.y }, corner, Math.PI / 2, Math.PI / 2, 12),
  );
  return points;
}

/**
 * A drop: a softly rounded point at the top, tangent sides, and a round belly.
 * The tip is its own small arc — a needle would read as a balloon — joined to
 * the belly's circle by the two tangents those circles share.
 */
function drop(): Pt[] {
  const tip = { x: 0, y: -1 };
  const belly = { x: 0, y: 0.3 };
  const radius = 0.62;
  const cap = 0.1;
  const span = distance(tip, belly);
  const half = Math.asin(radius / span);
  const axis = unit(subtract(tip, belly));
  const right = add(belly, times(rotate(axis, half), radius));
  const left = add(belly, times(rotate(axis, -half), radius));
  const centre = add(tip, times(axis, -cap / Math.sin(half)));
  const reach = cap / Math.tan(half);
  const rightCap = add(tip, times(unit(subtract(right, tip)), reach));
  const leftCap = add(tip, times(unit(subtract(left, tip)), reach));
  const points: Pt[] = [
    rightCap,
    ...arcBetween(belly, radius, angleAt(left, belly), angleAt(right, belly), Math.PI / 2, 72),
    leftCap,
    ...arcBetween(
      centre,
      cap,
      angleAt(leftCap, centre),
      angleAt(rightCap, centre),
      -Math.PI / 2,
      24,
    ).slice(1),
  ];
  return points;
}

/** The four discs whose union is the flower, and the edge that union gives at an angle. */
const PETALS = [
  { x: 0.42, y: 0 },
  { x: 0, y: 0.42 },
  { x: -0.42, y: 0 },
  { x: 0, y: -0.42 },
] as const;
const PETAL_RADIUS = 0.46;

function petalRadius(angle: number): number {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let edge = 0;
  for (const petal of PETALS) {
    const along = ux * petal.x + uy * petal.y;
    const outside = along * along - (petal.x ** 2 + petal.y ** 2 - PETAL_RADIUS ** 2);
    if (outside < 0) continue;
    edge = Math.max(edge, along + Math.sqrt(outside));
  }
  return edge;
}

/**
 * The far point where the ray `u` from the origin leaves the outline. Shapes
 * that are star-shaped around it meet it once; taking the far side keeps a
 * rounded corner's arc, which crosses it twice, out of the count.
 */
function rayHit(points: readonly Pt[], ux: number, uy: number): number {
  let far = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const slope = ux * ey - uy * ex;
    if (Math.abs(slope) < 1e-12) continue;
    const along = (a.x * ey - a.y * ex) / slope;
    const segment = (a.x * uy - a.y * ux) / slope;
    if (along > far && segment >= -1e-9 && segment <= 1 + 1e-9) far = along;
  }
  return far;
}

/* -------------------------------------------------------------------------
 * Eyes
 * ---------------------------------------------------------------------- */

/** Where each shape carries its face: the eyes' height and half-gap, in body radii. */
const FACE_FRAMES: Record<BotShape, { y: number; gap: number }> = {
  round: { y: 0.02, gap: 0.29 },
  square: { y: 0.02, gap: 0.29 },
  pebble: { y: 0.02, gap: 0.29 },
  triangle: { y: 0.25, gap: 0.26 },
  dome: { y: 0.02, gap: 0.28 },
  drop: { y: 0.16, gap: 0.25 },
  flower: { y: 0.02, gap: 0.27 },
  star: { y: 0.04, gap: 0.27 },
};

/** The character at `shape` and `face`, its eyes shrunk until they clear the rim. */
export function avatarFor(shape: BotShape, face: BotFace, size = 22): AvatarGeometry {
  const profile = shapeProfile(shape);
  // A small mark grows its eyes and its stroke so 16px still reads as a face
  // rather than two specks; the gap stays, so the two never run together.
  const small = size >= 24 ? 0 : Math.min(1, (24 - size) / 10);
  const grow = 1 + 0.3 * small;
  const gather = 1 + 0.02 * small;
  const frame = FACE_FRAMES[shape];
  const weight = EYE_WEIGHT + 0.06 * small;
  const placed = eyesOf(face, {
    y: frame.y,
    gap: frame.gap * gather,
    grow,
  });
  const scale = fitToBody(profile, placed, weight);
  return {
    profile,
    eyes: placed.map((eye) => shrink(eye, scale)),
    weight: weight * scale,
  };
}

/** Every expression, drawn in a face frame: the eyes' centers ±`gap`, at `y`. */
function eyesOf(face: BotFace, frame: { y: number; gap: number; grow: number }): AvatarEye[] {
  const { y, gap, grow } = frame;
  const mirrored = (build: (side: -1 | 1) => AvatarEye) => [build(-1), build(1)];
  switch (face) {
    case "calm":
      return mirrored((side) => dot(side * gap, y, 0.105, 0.14, grow));
    case "happy":
      return mirrored((side) => arch(side * gap, y + 0.02, 0.115, grow));
    case "wink":
      return [dot(-gap, y, 0.09, 0.125, grow), arch(gap, y + 0.02, 0.115, grow)];
    case "sleepy":
      return mirrored((side) => ({
        kind: "line",
        x: side * gap,
        y: y + 0.01,
        length: 0.2 * grow,
      }));
    case "curious":
      return [dot(-gap, y, 0.11, 0.115, grow), dot(gap, y + 0.05, 0.062, 0.068, grow)];
    case "focus":
      return mirrored((side) => dot(side * gap * 0.74, y + 0.03, 0.062, 0.072, grow));
  }
}

function dot(x: number, y: number, rx: number, ry: number, grow: number): AvatarEye {
  return { kind: "dot", x, y, rx: rx * grow, ry: ry * grow };
}

/** A "^": the top arc of a circle, its ends a little below the crown. */
function arch(x: number, y: number, radius: number, grow: number): AvatarEye {
  return {
    kind: "arc",
    x,
    y,
    radius: radius * grow,
    from: Math.PI * 1.12,
    to: Math.PI * 1.88,
  };
}

/**
 * How far the eyes may grow before one of their parts comes near the body's
 * edge. Scaling the whole face keeps the two eyes even; the outline is read at
 * each part's own angle, so a shape that is narrow where an eye sits shrinks
 * that face instead of clipping it.
 */
function fitToBody(profile: readonly number[], eyes: readonly AvatarEye[], weight: number): number {
  let fit = 1;
  for (const eye of eyes) {
    for (const point of eyePoints(eye)) {
      const reach = Math.hypot(point.x, point.y);
      if (reach < 1e-6) continue;
      const room = radiusAtAngle(profile, Math.atan2(point.y, point.x)) - AVATAR_RIM;
      fit = Math.min(fit, room / (reach + weight / 2));
    }
  }
  return clamp(fit, 0.35, 1);
}

/** The points of an eye that must stay inside the body: its own edge. */
export function eyePoints(eye: AvatarEye): Pt[] {
  if (eye.kind === "dot") {
    const points: Pt[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * TAU;
      points.push({
        x: eye.x + Math.cos(angle) * eye.rx,
        y: eye.y + Math.sin(angle) * eye.ry,
      });
    }
    return points;
  }
  if (eye.kind === "line") {
    return [
      { x: eye.x - eye.length / 2, y: eye.y },
      { x: eye.x + eye.length / 2, y: eye.y },
    ];
  }
  const points: Pt[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const angle = eye.from + ((eye.to - eye.from) * i) / steps;
    points.push({
      x: eye.x + Math.cos(angle) * eye.radius,
      y: eye.y + Math.sin(angle) * eye.radius,
    });
  }
  return points;
}

function shrink(eye: AvatarEye, by: number): AvatarEye {
  switch (eye.kind) {
    case "dot":
      return { ...eye, x: eye.x * by, y: eye.y * by, rx: eye.rx * by, ry: eye.ry * by };
    case "arc":
      return { ...eye, x: eye.x * by, y: eye.y * by, radius: eye.radius * by };
    case "line":
      return { ...eye, x: eye.x * by, y: eye.y * by, length: eye.length * by };
  }
}

/* -------------------------------------------------------------------------
 * Drawing
 * ---------------------------------------------------------------------- */

/** The context `drawAvatarFrame` records into: an NSH canvas, or a test's stand-in. */
export type AvatarCanvas = {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, from: number, to: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    from: number,
    to: number,
  ): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: unknown;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  globalCompositeOperation: string;
};

/**
 * Draws one frame of the character: the body filled in `color`, then the eyes
 * erased out of it. Erasing is what makes the eyes holes — the surface behind
 * the mark shows through — and the body path clips them, so no stray stroke
 * reaches past the edge. `time` is the frame's clock; batch B reads it here.
 */
export function drawAvatarFrame(canvas: AvatarCanvas, frame: AvatarFrame): void {
  const radius = frame.size / 2;
  const { profile, eyes, weight } = avatarFor(frame.shape, frame.face, frame.size);
  canvas.save();
  canvas.translate(radius, radius);
  canvas.scale(radius, radius);

  // The body: one smooth closed curve through the shared samples.
  canvas.beginPath();
  traceBody(canvas, profile);
  canvas.fillStyle = frame.color;
  canvas.fill();

  // The eyes, cut out of it. Only their alpha matters; the same accent keeps
  // the eraser the color this mark already had.
  canvas.clip();
  canvas.globalCompositeOperation = "destination-out";
  canvas.fillStyle = frame.color;
  canvas.strokeStyle = frame.color;
  canvas.lineWidth = weight;
  canvas.lineCap = "round";
  canvas.lineJoin = "round";
  for (const eye of eyes) drawEye(canvas, eye);
  canvas.restore();
}

/** The body's edge as a closed curve: samples are controls, their midpoints knots. */
function traceBody(canvas: AvatarCanvas, profile: readonly number[]): void {
  const count = profile.length;
  const point = (index: number): Pt => {
    const angle = ((index % count) / count) * TAU;
    const length = profile[index % count] ?? 0;
    return { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
  };
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(point(count - 1), point(0));
  canvas.moveTo(start.x, start.y);
  for (let i = 0; i < count; i++) {
    const control = point(i);
    const end = mid(point(i), point(i + 1));
    canvas.quadraticCurveTo(control.x, control.y, end.x, end.y);
  }
  canvas.closePath();
}

function drawEye(canvas: AvatarCanvas, eye: AvatarEye): void {
  canvas.beginPath();
  if (eye.kind === "dot") {
    canvas.ellipse(eye.x, eye.y, eye.rx, eye.ry, 0, 0, TAU);
    canvas.fill();
    return;
  }
  if (eye.kind === "line") {
    canvas.moveTo(eye.x - eye.length / 2, eye.y);
    canvas.lineTo(eye.x + eye.length / 2, eye.y);
    canvas.stroke();
    return;
  }
  canvas.arc(eye.x, eye.y, eye.radius, eye.from, eye.to);
  canvas.stroke();
}

/* -------------------------------------------------------------------------
 * Geometry helpers
 * ---------------------------------------------------------------------- */

/** A circle's arc from `from` over `sweep` radians, `steps` segments. */
function arcPoints(center: Pt, radius: number, from: number, sweep: number, steps: number): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = from + (sweep * i) / steps;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

/** The angle of `point` around `center`, in the canvas's axes. */
function angleAt(point: Pt, center: Pt): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

/** The arc between two angles that passes through `through`, `steps` long. */
function arcBetween(
  center: Pt,
  radius: number,
  from: number,
  to: number,
  through: number,
  steps: number,
): Pt[] {
  const forward = (((to - from) % TAU) + TAU) % TAU;
  const passing = (((through - from) % TAU) + TAU) % TAU;
  const sweep = passing <= forward + 1e-9 ? forward : forward - TAU;
  return arcPoints(center, radius, from, sweep, steps);
}

/** The turn from `from` to `to` the short way round, in (−π, π]. */
function shortestSweep(from: number, to: number): number {
  let sweep = (to - from) % TAU;
  if (sweep > Math.PI) sweep -= TAU;
  if (sweep <= -Math.PI) sweep += TAU;
  return sweep;
}

function rotate(point: Pt, angle: number): Pt {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** A point moved out to `by` times its distance from the origin. */
function times(point: Pt, by: number): Pt {
  return { x: point.x * by, y: point.y * by };
}

function dotOf(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

function unit(point: Pt): Pt {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

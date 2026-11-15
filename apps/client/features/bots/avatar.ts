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
 * clip them. The same fit runs on every frame the character moves, so the
 * drift and the breath cannot push an eye out of the body either.
 *
 * The character is a function of time, and nothing else: `avatarPose` says what
 * it is doing at an instant (a blink, where it looks, a breath), and
 * `avatarLook` folds that with the form it wears into the one body outline and
 * the few eyes a frame draws. At rest it blinks once every four to eight
 * seconds and its gaze drifts; working, it breathes, scans from side to side
 * and blinks more often; `time` 0 is the still pose every mark starts from, so
 * reduced motion has one frame to draw.
 */
import type { BotFace, BotIdentity, BotShape } from "./identity";

/** The angles every body shares, so a later batch can morph between them. */
export const AVATAR_SAMPLES = 64;

/** How much of the body's radius the eyes keep clear of: the visible rim. */
export const AVATAR_RIM = 0.11;

/** The eye weight at a mark's usual sizes, in body radii. */
const EYE_WEIGHT = 0.126;

/** A blink's run out and back, in milliseconds. */
const BLINK_MS = 150;

/** Between blinks at rest: four to eight seconds, each mark its own. */
const REST_BLINK_MS = 4000;
const REST_BLINK_SPREAD_MS = 4000;

/** A working mark blinks more often: every two to four seconds. */
const WORK_BLINK_MS = 2200;
const WORK_BLINK_SPREAD_MS = 1800;

/** The body's breath: a little over 4% of its height, once every 1.6 s. */
const BREATH_MS = 1600;
const BREATH = 0.04;

/**
 * At rest the gaze glides now and then rather than panning: every few seconds
 * the eyes ease to another place a sixth of a body away and hold there. A drift
 * with pauses, which is also what leaves the app still between them.
 */
const REST_GLANCE_MS = 9000;
const REST_GLANCE_EASE_MS = 480;
const REST_GLANCE = 0.06;

/** Working, it scans side to side and rests at each end. */
const WORK_GAZE_MS = 3600;
const WORK_GAZE = 0.16;

/** Motion eases in from rest: a mark that has just appeared does not snap into it. */
const SETTLE_MS = 220;

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

/** The form the mark wears: the body's shape and the face on it. */
export type AvatarForm = {
  shape: BotShape;
  face: BotFace;
};

/** A form the mark is coming from, and how far the change to the new one has got (0..1). */
export type AvatarFormChange = AvatarForm & { progress: number };

/** One eye as a frame draws it: where it is, how much of it shows, how shut it is. */
export type DrawnEye = {
  /** Its geometry, already fitted to the body. */
  shape: AvatarEye;
  /** How much of it shows (0..1): a change of form gives one eye way to the next. */
  alpha: number;
  /** How shut it is now (0 open, 1 closed): a dot flattens, an arch flattens, a line thins. */
  shut: number;
};

/** What one frame of the character is: the body's outline, its breath and the eyes on it. */
export type AvatarLook = {
  /** The body's radius at each of `AVATAR_SAMPLES` angles, the longest 1. */
  profile: readonly number[];
  eyes: readonly DrawnEye[];
  /** The eyes' stroke, in body radii (dots are filled, so it is theirs alone). */
  weight: number;
  /** The body's vertical scale, 1 at rest; it breathes about its own bottom. */
  breathe: number;
};

/** What the character is doing at one instant, in body radii. */
export type AvatarPose = {
  /** How shut the eyes are (0 open, 1 closed). */
  shut: number;
  /** Where the eyes look, shifted off their place. */
  gaze: { x: number; y: number };
  /** The body's vertical scale, 1 at rest. */
  breathe: number;
};

/** Everything one frame of the character is made of, and nothing reactive. */
export type AvatarInput = AvatarForm & {
  /** The mark's side in points. */
  size?: number;
  /** Milliseconds since the mark appeared; 0 is its still pose. */
  time?: number;
  /** A turn of this Bot's is running: the character works. */
  working?: boolean;
  /** Which mark it is, in [0,1): its own phase for the gaze and the blink. */
  seed?: number;
  /** The form it is coming from, and how far the change has got. */
  from?: AvatarFormChange | null;
};

/** A frame of the character: everything `drawAvatarFrame` needs, nothing reactive. */
export type AvatarFrame = AvatarForm & {
  /** The mark's side in points. */
  size: number;
  /** The body's fill. */
  color: string;
  /** Milliseconds since the mark appeared; 0 is its still pose. */
  time?: number;
  /** A turn of this Bot's is running: the character works. */
  working?: boolean;
  /** Which mark it is, in [0,1): its own phase for the gaze and the blink. */
  seed?: number;
  /** The form it is coming from, and how far the change has got. */
  from?: AvatarFormChange | null;
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
 * A drop: a wide round belly, a smaller round crown above it, and the two
 * outer tangents the circles share. The crown is the drop's point, and it is
 * round on purpose: a thinner one is a needle, and 64 samples read a needle as
 * a spike — the crown's arc has to be wide enough for the samples to carry.
 */
function drop(): Pt[] {
  const belly = { x: 0, y: 0.3 };
  const bellyRadius = 0.66;
  const crown = { x: 0, y: -0.74 };
  const crownRadius = 0.26;
  // The two circles' outer tangents: one radius turned the same way on each.
  const axis = unit(subtract(crown, belly));
  const turn = Math.acos((bellyRadius - crownRadius) / distance(belly, crown));
  const right = add(belly, times(rotate(axis, turn), bellyRadius));
  const rightCrown = add(crown, times(rotate(axis, turn), crownRadius));
  const left = add(belly, times(rotate(axis, -turn), bellyRadius));
  const leftCrown = add(crown, times(rotate(axis, -turn), crownRadius));
  return [
    rightCrown,
    ...arcBetween(
      crown,
      crownRadius,
      angleAt(rightCrown, crown),
      angleAt(leftCrown, crown),
      -Math.PI / 2,
      40,
    ).slice(1),
    left,
    ...arcBetween(
      belly,
      bellyRadius,
      angleAt(left, belly),
      angleAt(right, belly),
      Math.PI / 2,
      72,
    ).slice(1),
  ];
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
  round: { y: 0.02, gap: 0.4 },
  square: { y: 0.02, gap: 0.4 },
  pebble: { y: 0.02, gap: 0.4 },
  triangle: { y: 0.25, gap: 0.36 },
  dome: { y: 0.02, gap: 0.39 },
  drop: { y: 0.16, gap: 0.35 },
  flower: { y: 0.02, gap: 0.38 },
  star: { y: 0.04, gap: 0.38 },
};

/** The character at `shape` and `face`, its eyes shrunk until they clear the rim. */
export function avatarFor(shape: BotShape, face: BotFace, size = 22): AvatarGeometry {
  const placed = placeForm(shape, face, size);
  const scale = fitToBody(placed.profile, placed.eyes, placed.weight);
  return {
    profile: placed.profile,
    eyes: placed.eyes.map((eye) => shrink(eye, scale)),
    weight: placed.weight * scale,
  };
}

/** A form laid on its body but not yet fitted: the eyes as its face frame places them. */
type PlacedForm = {
  profile: readonly number[];
  eyes: AvatarEye[];
  weight: number;
};

function placeForm(shape: BotShape, face: BotFace, size: number): PlacedForm {
  // A small mark grows its eyes and its stroke so 16px still reads as a face
  // rather than two specks; the gap stays, so the two never run together.
  const small = size >= 24 ? 0 : Math.min(1, (24 - size) / 10);
  const grow = 1 + 0.3 * small;
  const gather = 1 + 0.02 * small;
  const frame = FACE_FRAMES[shape];
  return {
    profile: shapeProfile(shape),
    eyes: eyesOf(face, { y: frame.y, gap: frame.gap * gather, grow }),
    weight: EYE_WEIGHT + 0.06 * small,
  };
}

/**
 * What the character is doing at one instant, from the time alone: a blink, the
 * gaze, a breath. Pure in its four numbers, so any moment drawn twice is the
 * same picture, and `time` 0 is the still pose — nothing is under way.
 */
export function avatarPose(input: { time: number; working: boolean; seed: number }): AvatarPose {
  const time = Number.isFinite(input.time) ? Math.max(0, input.time) : 0;
  const seed = wrap01(input.seed);
  const gain = settleIn(time);
  if (gain === 0) return { shut: 0, gaze: { x: 0, y: 0 }, breathe: 1 };
  const working = input.working;

  const blink = blinkAt(seed, working, time);
  const gaze = working ? scan(seed, time) : glanceStep(seed, time);

  return {
    shut: blink.shut * gain,
    gaze: { x: gaze.x * gain, y: gaze.y * gain },
    // Only a working mark breathes: at rest the body itself keeps still.
    breathe: working ? 1 + BREATH * gain * Math.sin((TAU * time) / BREATH_MS) : 1,
  };
}

/** When a mark's picture next differs from the one at `time`, and whether it is moving now. */
export type AvatarMotion = { moving: boolean; next: number };

/**
 * What the clock needs to know about one mark: whether it is moving at `time`
 * (draw every frame) or when it next will be (draw then and no sooner). A mark
 * at rest is still between its blinks and its glances, and the clock may sleep
 * — which is why a screen of resting marks costs no frames at all.
 */
export function avatarMotion(input: {
  time: number;
  working: boolean;
  seed: number;
}): AvatarMotion {
  const time = Number.isFinite(input.time) ? Math.max(0, input.time) : 0;
  const seed = wrap01(input.seed);
  // Working, the body breathes and the eyes scan: every frame.
  if (input.working) return { moving: true, next: time };
  // A mark that has just appeared eases into its motion rather than snapping.
  if (time < SETTLE_MS) return { moving: true, next: time };
  const blink = blinkAt(seed, false, time);
  const look = glanceStep(seed, time);
  if (blink.shut > 0) return { moving: true, next: time };
  if (look.within < REST_GLANCE_EASE_MS) return { moving: true, next: time };
  return {
    moving: false,
    next: Math.min(blink.beginsAt, time + REST_GLANCE_MS - look.within),
  };
}

/** How far into its motion a mark that has just appeared is: 0 at rest, 1 once it has. */
function settleIn(time: number): number {
  const k = clamp(time / SETTLE_MS, 0, 1);
  return k * k * (3 - 2 * k);
}

/** A blink: how shut the eyes are, when this one began, and when the next begins. */
type Blink = { shut: number; beginsAt: number };

/** This mark's blink at `time`; between blinks, `beginsAt` is the next one's. */
function blinkAt(seed: number, working: boolean, time: number): Blink {
  // Blinks come on a period of the mark's own, so two marks never blink as one.
  const period = working
    ? WORK_BLINK_MS + seed * WORK_BLINK_SPREAD_MS
    : REST_BLINK_MS + seed * REST_BLINK_SPREAD_MS;
  const first = BLINK_MS + seed * (period - BLINK_MS);
  const since = wrap(time - first, period);
  const beganAt = time - since;
  if (since >= BLINK_MS) return { shut: 0, beginsAt: beganAt + period };
  return { shut: Math.sin((Math.PI * since) / BLINK_MS), beginsAt: beganAt };
}

/** Where this mark's eyes have come to rest, and how long ago the glide began. */
type Glance = { x: number; y: number; within: number };

/**
 * The resting gaze: a step of the mark's own that begins every few seconds and
 * is reached in about a third of one, the eyes easing over and then holding.
 * Its places come from the seed, so each mark looks somewhere else, and none of
 * them reaches past `REST_GLANCE`.
 */
function glanceStep(seed: number, time: number): Glance {
  const phase = seed * REST_GLANCE_MS;
  const index = Math.floor((time + phase) / REST_GLANCE_MS);
  const within = time + phase - index * REST_GLANCE_MS;
  const k = clamp(within / REST_GLANCE_EASE_MS, 0, 1);
  const ease = k * k * (3 - 2 * k);
  // Where the eyes were before this step and where it takes them: the first
  // step starts from the still pose, dead centre.
  const place = (step: number) =>
    step < 0
      ? { x: 0, y: 0 }
      : {
          x: REST_GLANCE * wander(seed, step),
          y: REST_GLANCE * 0.4 * wander(seed * 1.7 + 0.31, step),
        };
  const from = place(index - 1);
  const to = place(index);
  return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease, within };
}

/** A place the gaze comes to rest at, in [-1, 1]: the same one for the same seed and step. */
function wander(seed: number, step: number): number {
  const noise = Math.sin((seed * 91.7 + step * 37.719) * 12.9898) * 43758.5453;
  return (noise - Math.floor(noise)) * 2 - 1;
}

/** The working gaze: side to side, resting at each end as if reading. */
function scan(seed: number, time: number): Pt {
  const turn = TAU / WORK_GAZE_MS;
  const phase = turn * time + seed * TAU;
  return { x: WORK_GAZE * restAtEnds(Math.cos(phase)), y: 0 };
}

/**
 * A mark's own seed in [0,1). It comes from the identity the frame draws and
 * nothing else: two marks that look the same move alike, and two that look
 * different — any two Bots — blink on their own periods instead of in step.
 */
export function markSeed(identity: BotIdentity): number {
  const text = `${identity.color}/${identity.shape}/${identity.face}`;
  // FNV-1a over the identity's three names: cheap, stable, and spread enough.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

/** A scan that lingers at each side: the middle passes, the ends hold. */
function restAtEnds(value: number): number {
  return Math.tanh(2.4 * value) / Math.tanh(2.4);
}

/** `value` into [0, by). */
function wrap(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/** `value` into [0, 1). */
function wrap01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return wrap(value, 1);
}

/**
 * The character as one frame draws it: the form it wears (or the two it is
 * between), the pose of the instant, and the fit that keeps every eye inside
 * whatever outline comes out.
 */
export function avatarLook(input: AvatarInput): AvatarLook {
  const size = input.size ?? 22;
  const pose = avatarPose({
    time: input.time ?? 0,
    working: input.working ?? false,
    seed: input.seed ?? 0,
  });
  const to = placeForm(input.shape, input.face, size);
  const change = input.from && input.from.progress < 1 ? input.from : null;
  const from = change ? placeForm(change.shape, change.face, size) : to;
  const progress = change ? clamp(change.progress, 0, 1) : 1;

  // The eyes drift as one face, before the fit decides how far it may grow.
  const looking = (form: PlacedForm) => form.eyes.map((eye) => shift(eye, pose.gaze));
  const eyes: BlendedEye[] = change
    ? blendEyes(looking(from), looking(to), progress)
    : looking(to).map((eye) => ({ shape: eye, alpha: 1 }));
  const weight = change ? from.weight + (to.weight - from.weight) * progress : to.weight;
  const profile = change ? blendProfile(from.profile, to.profile, progress) : to.profile;
  const scale = fitToBody(
    profile,
    eyes.map((eye) => eye.shape),
    weight,
  );
  return {
    profile,
    eyes: eyes.map((eye) => ({
      shape: shrink(eye.shape, scale),
      alpha: eye.alpha,
      shut: pose.shut,
    })),
    weight: weight * scale,
    breathe: pose.breathe,
  };
}

/** How much of each eye of a different kind shows as one gives way to the other. */
const FADE = 1.6;

/** An eye in a look, before the fit: its geometry and how much of it shows. */
type BlendedEye = { shape: AvatarEye; alpha: number };

/** An eye moved to where the character looks. */
function shift(eye: AvatarEye, by: { x: number; y: number }): AvatarEye {
  return { ...eye, x: eye.x + by.x, y: eye.y + by.y };
}

/**
 * Two faces' eyes blending into one another. Same kind of eye on both sides:
 * its own numbers are interpolated, so a dot slides and grows into the next
 * dot. Different kinds (a dot against an arch): both are fitted to the place
 * the two share and one gives way to the other, so the eyes never jump kind.
 */
function blendEyes(
  from: readonly AvatarEye[],
  to: readonly AvatarEye[],
  progress: number,
): BlendedEye[] {
  const blended: BlendedEye[] = [];
  for (let index = 0; index < Math.max(from.length, to.length); index++) {
    const a = from[index] ?? to[index]!;
    const b = to[index] ?? from[index]!;
    if (a.kind === b.kind) {
      blended.push({ shape: betweenEyes(a, b, progress), alpha: 1 });
      continue;
    }
    const place = betweenPlaces(a, b, progress);
    // Both fainter than a plain fade would leave them: two eyes drawn over one
    // another at half each read as a smudge, two at a third as an eye changing.
    blended.push({ shape: reshape(a, place), alpha: (1 - progress) ** FADE });
    blended.push({ shape: reshape(b, place), alpha: progress ** FADE });
  }
  return blended;
}

/** Two eyes of one kind, their every number between. */
function betweenEyes(a: AvatarEye, b: AvatarEye, progress: number): AvatarEye {
  const at = (from: number, to: number) => from + (to - from) * progress;
  const x = at(a.x, b.x);
  const y = at(a.y, b.y);
  if (a.kind === "dot" && b.kind === "dot") {
    return { kind: "dot", x, y, rx: at(a.rx, b.rx), ry: at(a.ry, b.ry) };
  }
  if (a.kind === "arc" && b.kind === "arc") {
    return {
      kind: "arc",
      x,
      y,
      radius: at(a.radius, b.radius),
      from: at(a.from, b.from),
      to: at(a.to, b.to),
    };
  }
  if (a.kind === "line" && b.kind === "line") {
    return { kind: "line", x, y, length: at(a.length, b.length) };
  }
  return b;
}

/** How far an eye reaches from the middle of its own face. */
function eyeReach(eye: AvatarEye): number {
  if (eye.kind === "dot") return Math.max(eye.rx, eye.ry);
  if (eye.kind === "arc") return eye.radius;
  return eye.length / 2;
}

/** Where an eye sits and how far it reaches, between two eyes of different kinds. */
function betweenPlaces(a: AvatarEye, b: AvatarEye, progress: number) {
  const at = (from: number, to: number) => from + (to - from) * progress;
  return { x: at(a.x, b.x), y: at(a.y, b.y), reach: at(eyeReach(a), eyeReach(b)) };
}

/** One eye of its own kind, drawn at a place another eye gave it. */
function reshape(eye: AvatarEye, place: { x: number; y: number; reach: number }): AvatarEye {
  if (eye.kind === "dot") {
    const grow = place.reach / (Math.max(eye.rx, eye.ry) || 1);
    return { kind: "dot", x: place.x, y: place.y, rx: eye.rx * grow, ry: eye.ry * grow };
  }
  if (eye.kind === "arc") {
    return { kind: "arc", x: place.x, y: place.y, radius: place.reach, from: eye.from, to: eye.to };
  }
  return { kind: "line", x: place.x, y: place.y, length: place.reach * 2 };
}

/** One body's outline between two, sample by sample at the angles all share. */
function blendProfile(from: readonly number[], to: readonly number[], progress: number): number[] {
  return from.map((radius, index) => radius + ((to[index] ?? radius) - radius) * progress);
}

/** Every expression, drawn in a face frame: the eyes' centers ±`gap`, at `y`. */
function eyesOf(face: BotFace, frame: { y: number; gap: number; grow: number }): AvatarEye[] {
  const { y, gap, grow } = frame;
  const mirrored = (build: (side: -1 | 1) => AvatarEye) => [build(-1), build(1)];
  switch (face) {
    case "calm":
      return mirrored((side) => dot(side * gap, y, 0.147, 0.196, grow));
    case "happy":
      return mirrored((side) => arch(side * gap, y + 0.028, 0.161, grow));
    case "wink":
      return [dot(-gap, y, 0.126, 0.175, grow), arch(gap, y + 0.028, 0.161, grow)];
    case "sleepy":
      return mirrored((side) => ({
        kind: "line",
        x: side * gap,
        y: y + 0.014,
        length: 0.28 * grow,
      }));
    case "curious":
      return [dot(-gap, y, 0.154, 0.161, grow), dot(gap, y + 0.07, 0.087, 0.095, grow)];
    case "focus":
      return mirrored((side) => dot(side * gap * 0.74, y + 0.042, 0.087, 0.101, grow));
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
  globalAlpha: unknown;
  globalCompositeOperation: string;
};

/**
 * Draws one frame of the character: the body filled in `color`, then the eyes
 * erased out of it. Erasing is what makes the eyes holes — the surface behind
 * the mark shows through — and the body path clips them, so no stray stroke
 * reaches past the edge. Everything the frame is, including what the character
 * is doing at its `time`, is decided by `avatarLook`; this only records it.
 */
export function drawAvatarFrame(canvas: AvatarCanvas, frame: AvatarFrame): void {
  const radius = frame.size / 2;
  const look = avatarLook(frame);
  canvas.save();
  canvas.translate(radius, radius);
  canvas.scale(radius, radius);
  // A frame leaves alpha and the eraser's blend behind it; start clean.
  canvas.globalAlpha = 1;
  canvas.globalCompositeOperation = "source-over";

  // The breath squashes the whole character about its own foot, so it stays
  // sitting where it stands and its eyes keep their place on its face.
  if (look.breathe !== 1) {
    const foot = footOf(look.profile);
    canvas.translate(0, foot);
    canvas.scale(1, look.breathe);
    canvas.translate(0, -foot);
  }

  // The body: one smooth closed curve through the shared samples.
  canvas.beginPath();
  traceBody(canvas, look.profile);
  canvas.fillStyle = frame.color;
  canvas.fill();

  // The eyes, cut out of it. Only their alpha matters; the same accent keeps
  // the eraser the color this mark already had.
  canvas.clip();
  canvas.globalCompositeOperation = "destination-out";
  canvas.fillStyle = frame.color;
  canvas.strokeStyle = frame.color;
  canvas.lineCap = "round";
  canvas.lineJoin = "round";
  for (const eye of look.eyes) drawEye(canvas, eye, look.weight);
  canvas.globalAlpha = 1;
  canvas.globalCompositeOperation = "source-over";
  canvas.restore();
}

/** How far down the body goes: the line its breath keeps to the ground. */
function footOf(profile: readonly number[]): number {
  let foot = 0;
  for (let index = 0; index < profile.length; index++) {
    const angle = (index / profile.length) * TAU;
    foot = Math.max(foot, Math.sin(angle) * (profile[index] ?? 0));
  }
  return foot;
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

/** One eye as the instant has it: a dot flattens, an arch flattens, a line thins. */
function drawEye(canvas: AvatarCanvas, drawn: DrawnEye, weight: number): void {
  const eye = drawn.shape;
  const shut = clamp(drawn.shut, 0, 1);
  canvas.globalAlpha = clamp(drawn.alpha, 0, 1);
  canvas.beginPath();
  if (eye.kind === "dot") {
    canvas.ellipse(eye.x, eye.y, eye.rx, eye.ry * (1 - 0.9 * shut), 0, 0, TAU);
    canvas.fill();
    return;
  }
  if (eye.kind === "line") {
    canvas.lineWidth = weight * (1 - 0.8 * shut);
    canvas.moveTo(eye.x - eye.length / 2, eye.y);
    canvas.lineTo(eye.x + eye.length / 2, eye.y);
    canvas.stroke();
    return;
  }
  canvas.lineWidth = weight;
  canvas.ellipse(eye.x, eye.y, eye.radius, eye.radius * (1 - 0.62 * shut), 0, eye.from, eye.to);
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

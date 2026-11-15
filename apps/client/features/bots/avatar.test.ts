/**
 * The avatar's geometry, without a screen: every body is 64 radii all shapes
 * share and one is the longest; every eye of every face stays inside the body
 * with the rim between them, narrow shapes included; and a frame draws the body
 * first and then erases the eyes out of it.
 */
import { expect, test } from "nsh/test";

import {
  AVATAR_RIM,
  AVATAR_SAMPLES,
  avatarFor,
  drawAvatarFrame,
  eyePoints,
  radiusAtAngle,
  shapeProfile,
  type AvatarCanvas,
  type AvatarEye,
  type AvatarFrame,
} from "./avatar";
import { BOT_FACES, BOT_SHAPES } from "./identity";

const SIZES = [16, 18, 20, 22, 28, 38, 48, 56, 96];

test("every body is the same 64 radii, its longest normalized to 1", () => {
  for (const shape of BOT_SHAPES) {
    const profile = shapeProfile(shape);
    expect(profile).toHaveLength(AVATAR_SAMPLES);
    expect(Math.max(...profile)).toBe(1);
    // Nothing pinholes at the center: a body keeps a real width all round.
    expect(Math.min(...profile)).toBeGreaterThan(0.2);
    expect(radiusAtAngle(profile, 0)).toBe(profile[0]!);
    expect(radiusAtAngle(profile, Math.PI * 2)).toBe(profile[0]!);
  }
});

test("no body jumps between two neighbouring samples", () => {
  // The samples are 5.6° apart, so a smooth outline changes its radius by a
  // little at each step. The star's notch is the sharpest turn the eight make;
  // anything well past it is a shape the samples cannot carry — the drop's
  // first crown was, and it drew as a spike.
  const jumps = BOT_SHAPES.map((shape) => {
    const profile = shapeProfile(shape);
    let worst = 0;
    for (let i = 0; i < profile.length; i++) {
      const step = Math.abs((profile[(i + 1) % profile.length] ?? 0) - (profile[i] ?? 0));
      worst = Math.max(worst, step);
    }
    return { shape, worst: Math.round(worst * 1000) / 1000 };
  });
  // Named, so a failure reads as the body that jumped.
  expect(jumps.filter((jump) => jump.worst >= 0.13)).toEqual([]);
});

test("the drop's crown is round, not a needle", () => {
  // Read the drop's silhouette as the samples describe it, and measure its
  // width where a drop is narrowest. A needle stays a sliver there; a crown
  // this size is a third of the body.
  const profile = shapeProfile("drop");
  const points = profile.map((radius, index) => {
    const angle = (index / profile.length) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const widest = Math.max(...points.map((point) => Math.abs(point.x)));
  const at = top + (bottom - top) * 0.1;
  const halfWidth = Math.max(
    ...points.map((point, index) => {
      const next = points[(index + 1) % points.length]!;
      if ((point.y - at) * (next.y - at) > 0) return 0;
      const between = (at - point.y) / (next.y - point.y);
      return Math.abs(point.x + (next.x - point.x) * between);
    }),
  );
  expect(halfWidth / widest).toBeGreaterThan(0.25);
});

test("the eight shapes are eight different bodies", () => {
  const seen = BOT_SHAPES.map((shape) =>
    shapeProfile(shape)
      .map((radius) => radius.toFixed(3))
      .join(","),
  );
  expect(new Set(seen).size).toBe(BOT_SHAPES.length);
});

test("no eye of any face leaves the body, at every size the app draws", () => {
  for (const shape of BOT_SHAPES) {
    for (const face of BOT_FACES) {
      for (const size of SIZES) {
        const { profile, eyes } = avatarFor(shape, face, size);
        for (const eye of eyes) {
          // The eye's center keeps a wide berth of its own.
          const reach = Math.hypot(eye.x, eye.y);
          const room = radiusAtAngle(profile, Math.atan2(eye.y, eye.x));
          expect(reach).toBeLessThan(room - 0.12);
          // And so does every point of its edge, stroke included.
          for (const point of eyePoints(eye)) {
            const edge = radiusAtAngle(profile, Math.atan2(point.y, point.x));
            expect(Math.hypot(point.x, point.y)).toBeLessThan(edge - AVATAR_RIM + 1e-9);
          }
        }
      }
    }
  }
});

test("a narrow body holds its two eyes apart", () => {
  for (const shape of ["triangle", "drop", "star", "dome"] as const) {
    for (const face of BOT_FACES) {
      for (const size of [16, 48, 96]) {
        const eyes = avatarFor(shape, face, size).eyes;
        const [left, right] = eyes as [AvatarEye, AvatarEye];
        const gap = right.x - left.x;
        const widths = (eye: AvatarEye) =>
          eye.kind === "dot" ? eye.rx : eye.kind === "arc" ? eye.radius : eye.length / 2;
        expect(gap).toBeGreaterThan(widths(left) * 0.6 + widths(right) * 0.6);
      }
    }
  }
});

test("a small mark grows its eyes so 16px still shows a face", () => {
  const big = avatarFor("round", "calm", 48);
  const small = avatarFor("round", "calm", 16);
  const first = (eyes: readonly AvatarEye[]) => eyes[0] as Extract<AvatarEye, { kind: "dot" }>;
  // The same shape in body radii, drawn a third as wide, keeps more of it.
  expect(first(small.eyes).rx).toBeGreaterThan(first(big.eyes).rx * 1.15);
  expect(first(small.eyes).ry).toBeGreaterThan(first(big.eyes).ry * 1.15);
  expect(small.weight).toBeGreaterThan(big.weight);
});

test("a frame fills the body, then cuts the eyes out of it", () => {
  const canvas = new Recorder();
  const frame: AvatarFrame = {
    shape: "star",
    face: "calm",
    color: "#12A594",
    size: 48,
    time: 0,
  };
  drawAvatarFrame(canvas, frame);
  const fills = canvas.calls.filter((call) => call.op === "fill");
  const strokes = canvas.calls.filter((call) => call.op === "stroke");
  // One filled body, then one filled dot per eye, erased rather than painted.
  expect(fills).toHaveLength(1 + 2);
  expect(strokes).toHaveLength(0);
  expect(canvas.calls.findIndex((call) => call.op === "clip")).toBeGreaterThan(
    canvas.calls.findIndex((call) => call.op === "fill"),
  );
  const erasing = canvas.calls.filter((call) => call.op === "composite");
  expect(erasing).toHaveLength(1);
  expect(erasing[0]?.value).toBe("destination-out");
  expect(canvas.fillStyles).toEqual([frame.color, frame.color, frame.color]);
  expect(canvas.calls[canvas.calls.length - 1]?.op).toBe("restore");
});

test("an arched face strokes its eyes instead of filling them", () => {
  const canvas = new Recorder();
  drawAvatarFrame(canvas, {
    shape: "dome",
    face: "happy",
    color: "#6C63F0",
    size: 22,
  });
  expect(canvas.calls.filter((call) => call.op === "stroke")).toHaveLength(2);
  expect(canvas.calls.filter((call) => call.op === "fill")).toHaveLength(1);
  expect(canvas.lineWidths.every((width) => width > 0)).toBe(true);
});

/** A canvas that keeps what a frame recorded, in order. */
class Recorder implements AvatarCanvas {
  calls: { op: string; value?: unknown }[] = [];
  fillStyles: unknown[] = [];
  lineWidths: number[] = [];
  fillStyle: unknown = null;
  strokeStyle: unknown = null;
  lineWidth: unknown = 0;
  lineCap: "butt" | "round" | "square" = "butt";
  lineJoin: "miter" | "round" | "bevel" = "miter";
  private composite = "source-over";

  private note(op: string) {
    this.calls.push({ op, value: this.fillStyle ?? undefined });
    if (op === "fill") this.fillStyles.push(this.fillStyle);
  }

  save() {
    this.calls.push({ op: "save" });
  }
  restore() {
    this.calls.push({ op: "restore" });
  }
  translate() {
    this.calls.push({ op: "translate" });
  }
  scale() {
    this.calls.push({ op: "scale" });
  }
  beginPath() {
    this.calls.push({ op: "beginPath" });
  }
  moveTo() {
    this.calls.push({ op: "moveTo" });
  }
  lineTo() {
    this.calls.push({ op: "lineTo" });
  }
  quadraticCurveTo() {
    this.calls.push({ op: "quadraticCurveTo" });
  }
  closePath() {
    this.calls.push({ op: "closePath" });
  }
  arc() {
    this.calls.push({ op: "arc" });
  }
  ellipse() {
    this.calls.push({ op: "ellipse" });
  }
  fill() {
    this.note("fill");
  }
  stroke() {
    if (typeof this.lineWidth === "number") this.lineWidths.push(this.lineWidth);
    this.note("stroke");
  }
  clip() {
    this.calls.push({ op: "clip" });
  }

  set globalCompositeOperation(value: string) {
    this.composite = value;
    this.calls.push({ op: "composite", value });
  }

  get globalCompositeOperation(): string {
    return this.composite;
  }
}

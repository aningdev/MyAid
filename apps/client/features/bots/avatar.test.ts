/**
 * The avatar's geometry and its motion, without a screen: every body is 64
 * radii all shapes share and one is the longest; every eye of every face stays
 * inside the body with the rim between them, narrow shapes included, at every
 * moment the character moves through; a frame is a pure function of its time,
 * so one moment drawn twice is one picture; the breath, the blink and the gaze
 * keep the numbers the batch agreed; and a frame draws the body first and then
 * erases the eyes out of it.
 */
import { expect, test } from "nsh/test";

import {
  AVATAR_RIM,
  AVATAR_SAMPLES,
  avatarFor,
  avatarLook,
  avatarPose,
  avatarMotion,
  drawAvatarFrame,
  eyePoints,
  markSeed,
  radiusAtAngle,
  shapeProfile,
  type AvatarCanvas,
  type AvatarEye,
  type AvatarFrame,
  type AvatarLook,
} from "./avatar";
import { formBook } from "./avatarMorph";
import { BOT_COLORS, BOT_FACES, BOT_SHAPES, type BotIdentity } from "./identity";

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
  // The eraser's blend is put back at the end, so the next frame's body paints
  // rather than erases.
  const blends = canvas.calls.filter((call) => call.op === "composite").map((call) => call.value);
  expect(blends).toContain("destination-out");
  expect(blends[0]).toBe("source-over");
  expect(blends[blends.length - 1]).toBe("source-over");
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

test("a moment is its time: the same frame drawn twice is the same picture", () => {
  const moment = {
    shape: "pebble",
    face: "curious",
    color: "#E8A13A",
    size: 32,
    time: 1234,
    working: true,
    seed: 0.42,
  } as const;
  const first = new Recorder();
  const second = new Recorder();
  drawAvatarFrame(first, moment);
  drawAvatarFrame(second, moment);
  expect(first.calls).toEqual(second.calls);
  expect(first.ellipses).toEqual(second.ellipses);
  // And the geometry is a function of the same numbers, not of a running state.
  expect(avatarLook(moment)).toEqual(avatarLook(moment));
});

test("time 0 is the still pose: the picture batch A drew", () => {
  for (const shape of BOT_SHAPES) {
    for (const face of BOT_FACES) {
      const still = avatarFor(shape, face, 22);
      const look = avatarLook({ shape, face, size: 22, time: 0, working: true, seed: 0.6 });
      expect(look.profile).toEqual(still.profile);
      expect(look.eyes.map((eye) => eye.shape)).toEqual(still.eyes);
      expect(look.breathe).toBe(1);
      expect(look.eyes.every((eye) => eye.shut === 0)).toBe(true);
    }
  }
});

test("the breath is ±4% of the height, once every 1.6 s, and never lifts the foot", () => {
  const seen: number[] = [];
  for (let time = 2000; time < 5200; time += 10) {
    seen.push(avatarPose({ time, working: true, seed: 0.3 }).breathe);
  }
  expect(Math.max(...seen)).toBeGreaterThan(1.03);
  expect(Math.max(...seen)).toBeLessThan(1.041);
  expect(Math.min(...seen)).toBeLessThan(0.97);
  expect(Math.min(...seen)).toBeGreaterThan(0.959);

  // The body squashes as one piece about its own bottom: the canvas stores a
  // vertical scale of its own and no horizontal one, so nothing inside moves
  // relative to the body, and the foot stays on the ground.
  const canvas = new Recorder();
  const at = 400;
  drawAvatarFrame(canvas, {
    shape: "round",
    face: "calm",
    color: "#12A594",
    size: 48,
    time: at,
    working: true,
    seed: 0.3,
  });
  expect(canvas.scales).toEqual([
    [24, 24],
    [1, avatarPose({ time: at, working: true, seed: 0.3 }).breathe],
  ]);
});

test("working squashes and stretches the body, and at rest it does not", () => {
  const breath = (working: boolean) => {
    let low = 1;
    let high = 1;
    for (let time = 0; time < 2400; time += 20) {
      const value = avatarPose({ time, working, seed: 0.1 }).breathe;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    return { low, high };
  };
  const working = breath(true);
  expect(working.high - working.low).toBeGreaterThan(0.06);
  const resting = breath(false);
  expect(resting.high - resting.low).toBeLessThan(1e-9);
});

test("two marks blink on their own periods, and never in step", () => {
  const blinks = (seed: number, working: boolean, span: number) => {
    const starts: number[] = [];
    let wasBlinking = false;
    for (let time = 0; time <= span; time += 5) {
      const blinking = avatarPose({ time, working, seed }).shut > 0.5;
      if (blinking && !wasBlinking) starts.push(time);
      wasBlinking = blinking;
    }
    return starts;
  };
  const rest = blinks(0.15, false, 32000);
  // A blink every four to eight seconds, each mark its own offset.
  expect(rest.length).toBeGreaterThan(3);
  for (let index = 1; index < rest.length; index++) {
    const gap = rest[index]! - rest[index - 1]!;
    expect(gap).toBeGreaterThanOrEqual(4000);
    expect(gap).toBeLessThanOrEqual(8000);
  }
  const other = blinks(0.72, false, 32000);
  expect(Math.abs(other[0]! - rest[0]!)).toBeGreaterThan(300);
  expect(other.slice(0, 3)).not.toEqual(rest.slice(0, 3));

  // Working, blinks come more often: two to four seconds apart.
  const busy = blinks(0.15, true, 32000);
  const busyGaps = busy.slice(1).map((time, index) => time - busy[index]!);
  expect(Math.min(...busyGaps)).toBeGreaterThanOrEqual(2200);
  expect(Math.max(...busyGaps)).toBeLessThanOrEqual(4000);
});

test("a blink is over in about 150 ms", () => {
  const seed = 0.4;
  let start = -1;
  for (let time = 0; time < 20000; time += 1) {
    if (avatarPose({ time, working: false, seed }).shut > 0.02) {
      start = time;
      break;
    }
  }
  expect(start).toBeGreaterThan(0);
  let end = start;
  while (avatarPose({ time: end, working: false, seed }).shut > 0.02) end += 1;
  expect(end - start).toBeGreaterThan(140);
  expect(end - start).toBeLessThan(160);
});

test("at rest the gaze glides now and then, and holds between its glances", () => {
  // Two eyes sit half a body apart (the eye at x = 0.4 either side of it): the
  // glance at rest moves them under a tenth of that, the scan at work under a
  // quarter — enough to see, not enough to leave the body.
  const eyes = 0.8;
  for (let time = 0; time < 30000; time += 25) {
    for (const working of [false, true]) {
      const { gaze } = avatarPose({ time, working, seed: 0.77 });
      expect(Math.abs(gaze.x)).toBeLessThanOrEqual(eyes * (working ? 0.22 : 0.08) + 1e-9);
    }
  }
  // Seed 0.2 looks again at 7.2 s, reaching the new place in half a second;
  // between one glance and the next its eyes hold still.
  const gazeAt = (time: number) => avatarPose({ time, working: false, seed: 0.2 }).gaze;
  const gliding = new Set(
    Array.from({ length: 40 }, (_, index) => gazeAt(7240 + index * 8).x.toFixed(4)),
  );
  expect(gliding.size).toBeGreaterThan(20);
  expect(gazeAt(1500)).toEqual(gazeAt(4000));
  // A working mark looks about further than a resting one ever does.
  const scan = Math.max(
    ...Array.from({ length: 200 }, (_, index) =>
      Math.abs(avatarPose({ time: index * 25, working: true, seed: 0.77 }).gaze.x),
    ),
  );
  expect(scan).toBeGreaterThan(eyes * 0.1);
});

test("the clock is asked for frames only while a mark moves", () => {
  const seed = 0.2;
  // Between its blinks and its glances a resting mark is still, and says when
  // it will not be: the clock may sleep until then.
  const quiet = avatarMotion({ time: 3000, working: false, seed });
  expect(quiet.moving).toBe(false);
  expect(quiet.next).toBeGreaterThan(3000);
  expect(quiet.next).toBeLessThanOrEqual(3000 + 8000);
  const before = avatarPose({ time: quiet.next - 1, working: false, seed });
  const after = avatarPose({ time: quiet.next + 1, working: false, seed });
  expect(after).not.toEqual(before);
  // Mid-glance it is moving, and mid-blink too; working it never rests.
  expect(avatarMotion({ time: 7240, working: false, seed }).moving).toBe(true);
  let blink = 0;
  while (avatarPose({ time: blink, working: false, seed }).shut === 0) blink += 1;
  expect(avatarMotion({ time: blink + 40, working: false, seed }).moving).toBe(true);
  expect(avatarMotion({ time: 3000, working: true, seed }).moving).toBe(true);
  // A whole minute of rest, and it asks for a frame less than a fifth of it.
  let moving = 0;
  for (let time = 0; time < 60000; time += 10) {
    if (avatarMotion({ time, working: false, seed }).moving) moving += 10;
  }
  expect(moving / 60000).toBeLessThan(0.2);
});

test("every eye stays in the body at every moment the character moves", () => {
  const times = [0, 260, 400, 800, 1200, 1600, 2400, 3200, 5000, 7500];
  for (const shape of BOT_SHAPES) {
    for (const face of BOT_FACES) {
      for (const size of [16, 22, 48]) {
        for (const time of times) {
          for (const working of [false, true]) {
            const look = avatarLook({ shape, face, size, time, working, seed: 0.31 });
            expectInside(look);
          }
        }
      }
    }
  }
});

test("a change of form keeps every eye in the body it is becoming", () => {
  for (const shape of BOT_SHAPES) {
    for (const face of BOT_FACES) {
      for (const progress of [0.15, 0.5, 0.85]) {
        const look = avatarLook({
          shape: "star",
          face: "sleepy",
          size: 22,
          time: 1500,
          working: true,
          seed: 0.55,
          from: { shape, face, progress },
        });
        expectInside(look);
      }
    }
  }
});

test("a change of form interpolates both boundaries", () => {
  const round = shapeProfile("round");
  const star = shapeProfile("star");
  const look = avatarLook({
    shape: "star",
    face: "calm",
    size: 48,
    from: { shape: "round", face: "calm", progress: 0.5 },
  });
  // The outline is half way, sample by sample.
  expect(look.profile).toEqual(round.map((radius, i) => (radius + star[i]!) / 2));
  // The same kind of eye on both sides: one eye per side, its numbers between.
  expect(look.eyes).toHaveLength(2);
  expect(look.eyes.every((eye) => eye.alpha === 1 && eye.shape.kind === "dot")).toBe(true);
  const at = (progress: number) =>
    avatarLook({
      shape: "star",
      face: "calm",
      size: 48,
      from: { shape: "round", face: "calm", progress },
    }).eyes.map((eye) => eye.shape);
  // Each end is the form itself, so a change starts and ends on the mark's own
  // picture rather than near it.
  expect(at(0)).toEqual(avatarFor("round", "calm", 48).eyes);
  expect(at(1)).toEqual(avatarFor("star", "calm", 48).eyes);
  const [roundEye, starEye] = [
    (at(0)[0] as Extract<AvatarEye, { kind: "dot" }>).x,
    (at(1)[0] as Extract<AvatarEye, { kind: "dot" }>).x,
  ];
  const middle = (at(0.5)[0] as Extract<AvatarEye, { kind: "dot" }>).x;
  expect(middle).toBeGreaterThan(roundEye);
  expect(middle).toBeLessThan(starEye);
});

test("a dot gives way to an arch rather than turning into one", () => {
  const look = avatarLook({
    shape: "dome",
    face: "happy",
    size: 48,
    from: { shape: "dome", face: "calm", progress: 0.5 },
  });
  const kinds = look.eyes.map((eye) => eye.shape.kind);
  expect(kinds.filter((kind) => kind === "dot")).toHaveLength(2);
  expect(kinds.filter((kind) => kind === "arc")).toHaveLength(2);
  // Two eyes' worth remained, neither of them whole: both fainter than a plain
  // half, so the pair reads as one eye changing rather than two overlapping.
  const alphas = look.eyes.map((eye) => eye.alpha);
  expect(alphas).toHaveLength(4);
  expect(alphas.every((alpha) => alpha > 0.2 && alpha < 0.45)).toBe(true);
});

test("a blink squashes the eyes, then gives them back", () => {
  const seed = 0.4;
  let middle = 0;
  let deepest = 0;
  for (let time = 0; time < 20000; time += 1) {
    const shut = avatarPose({ time, working: false, seed }).shut;
    if (shut > deepest) {
      deepest = shut;
      middle = time;
    }
  }
  expect(deepest).toBeGreaterThan(0.99);
  const open = new Recorder();
  drawAvatarFrame(open, { shape: "round", face: "calm", color: "#12A594", size: 48, time: 0 });
  const blinking = new Recorder();
  drawAvatarFrame(blinking, {
    shape: "round",
    face: "calm",
    color: "#12A594",
    size: 48,
    time: middle,
    seed,
  });
  const tallest = (recorder: Recorder) => Math.max(...recorder.ellipses.map((e) => e.ry));
  expect(tallest(blinking)).toBeLessThan(tallest(open) * 0.2);
});

test("a mark's seed is its identity, and different marks move differently", () => {
  const one: BotIdentity = { color: "indigo", shape: "round", face: "calm" };
  expect(markSeed(one)).toBe(markSeed({ ...one }));
  const seeds = new Set<number>();
  for (const color of BOT_COLORS) {
    for (const shape of BOT_SHAPES) {
      seeds.add(markSeed({ color, shape, face: "calm" }));
    }
  }
  expect(seeds.size).toBe(BOT_COLORS.length * BOT_SHAPES.length);
  for (const seed of seeds) {
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1);
  }
});

test("a change of form eases out in about a quarter second, and a still mark keeps still", () => {
  const book = formBook();
  const round = { shape: "round", face: "calm" } as const;
  const star = { shape: "star", face: "calm" } as const;
  // The form a mark appears in is not a change.
  expect(book.at(round, 0, false)).toBeNull();
  expect(book.at(round, 100, false)).toBeNull();
  // A press morphs from what it was; the same numbers twice give the same answer.
  const start = book.at(star, 1000, false);
  expect(start).toEqual({ shape: "round", face: "calm", progress: 0 });
  const half = book.at(star, 1000 + 83, false);
  expect(half?.progress).toBeGreaterThan(0.6);
  expect(half?.progress).toBeLessThan(0.65);
  expect(book.at(star, 1300, false)).toBeNull();
  // Reduced motion cuts.
  const cut = formBook();
  cut.at(round, 0, false);
  expect(cut.at(star, 10, true)).toBeNull();
  expect(cut.at(star, 20, true)).toBeNull();
});

/** Every drawn eye of a look, its edge and its reach, inside the body's rim. */
function expectInside(look: AvatarLook): void {
  for (const eye of look.eyes) {
    if (eye.alpha === 0) continue;
    const reach = Math.hypot(eye.shape.x, eye.shape.y);
    const room = radiusAtAngle(look.profile, Math.atan2(eye.shape.y, eye.shape.x));
    expect(reach).toBeLessThan(room);
    for (const point of eyePoints(eye.shape)) {
      const edge = radiusAtAngle(look.profile, Math.atan2(point.y, point.x));
      expect(Math.hypot(point.x, point.y)).toBeLessThan(edge - AVATAR_RIM + 1e-9);
    }
  }
}

/** A canvas that keeps what a frame recorded, in order. */
class Recorder implements AvatarCanvas {
  calls: { op: string; value?: unknown }[] = [];
  fillStyles: unknown[] = [];
  lineWidths: number[] = [];
  ellipses: { x: number; y: number; rx: number; ry: number }[] = [];
  scales: [number, number][] = [];
  fillStyle: unknown = null;
  strokeStyle: unknown = null;
  lineWidth: unknown = 0;
  lineCap: "butt" | "round" | "square" = "butt";
  lineJoin: "miter" | "round" | "bevel" = "miter";
  globalAlpha: unknown = 1;
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
  scale(x: number, y: number) {
    this.calls.push({ op: "scale", value: [x, y] });
    this.scales.push([x, y]);
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
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.calls.push({ op: "ellipse" });
    this.ellipses.push({ x, y, rx, ry });
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

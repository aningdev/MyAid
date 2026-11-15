/**
 * The one clock as the app runs it. `features/bots/avatarClock.test.ts` drives
 * the loop and its waits with stand-ins; this opens a screen with twenty marks
 * and reads the clock's own state through it, on `nsh test`'s manual clock, so
 * nothing here waits on a real frame:
 *
 *   nsh test screens/avatar-b-clock.test.tsx
 *
 * Twenty marks cost one loop, drawn at the display's rate and never one loop
 * apiece; a resting screen leaves the app quiet, so a test's steps stay quick;
 * the last mark leaving stops the loop; reduced motion never starts it, and the
 * still pose is what every mark draws.
 */
import { expect, test } from "nsh/test";
import type { App } from "nsh/test";

import { open } from "../test/open";

type ClockState = {
  marks: number;
  running: boolean;
  sleeping: boolean;
  ticks: number;
  time: number;
};

/** The clock's state, as the harness screen prints it. */
function clockOf(app: App): ClockState {
  const line = app.texts().find((text) => text.startsWith("marks="));
  if (!line) throw new Error(`the clock's state is not on screen: ${app.texts().join(" | ")}`);
  const value = (name: string) => Number(new RegExp(`${name}=(-?\\d+)`).exec(line)?.[1] ?? NaN);
  return {
    marks: value("marks"),
    running: /running=(true|false)/.exec(line)?.[1] === "true",
    sleeping: /sleeping=(true|false)/.exec(line)?.[1] === "true",
    ticks: value("ticks"),
    time: value("time"),
  };
}

test("twenty marks cost one loop, at the display's rate, and the screen rests", async () => {
  const app = await open("./avatar-b-clock-harness.tsx", {
    platform: "macos" as const,
    width: 980,
    height: 640,
    clock: {},
  });
  await app.waitFor("id:clock-state");
  const clock = app.clock!;

  expect(clockOf(app).marks).toBe(20);
  expect(clockOf(app).running).toBe(true);
  expect(app.count("id:bot-mark-working")).toBe(0);

  // One loop's frames, whatever the twenty marks are doing: a frame every 16 ms
  // of the clock, never twenty frames.
  const before = clockOf(app);
  await clock.runFor(400);
  const after = clockOf(app);
  const frames = after.ticks - before.ticks;
  const displayFrames = (after.time - before.time) / 16;
  expect(frames).toBeLessThanOrEqual(displayFrames + 4);

  // A resting screen leaves the app quiet between its marks' moves: five
  // presses take a moment, not a wait apiece on an animation that never ends.
  const began = Date.now();
  for (let index = 0; index < 5; index++) await app.press("id:clock-toggle-marks");
  expect(Date.now() - began).toBeLessThan(2000);
  await app.waitFor("id:clock-state");
});

test("the last mark leaving stops the loop, and the next one starts it again", async () => {
  const app = await open("./avatar-b-clock-harness.tsx", {
    platform: "macos" as const,
    width: 980,
    height: 640,
    clock: {},
  });
  await app.waitFor("id:clock-state");
  const clock = app.clock!;
  await clock.runFor(300);

  await app.press("id:clock-toggle-marks");
  await app.waitUntil(() => clockOf(app).marks === 0);
  const stopped = clockOf(app);
  expect(stopped.running).toBe(false);
  expect(stopped.sleeping).toBe(false);
  await clock.runFor(600);
  expect(clockOf(app).ticks).toBe(stopped.ticks);

  // Back on screen: the same clock, carrying the time it had drawn.
  await app.press("id:clock-toggle-marks");
  await app.waitUntil(() => clockOf(app).marks === 20);
  expect(clockOf(app).running).toBe(true);
  const resumed = clockOf(app);
  expect(resumed.time).toBeGreaterThanOrEqual(stopped.time);
  await clock.runFor(600);
  expect(clockOf(app).ticks).toBeGreaterThan(resumed.ticks);
});

test("a mark at work is drawn frame by frame, and no badge is added to it", async () => {
  const app = await open("./avatar-b-clock-harness.tsx", {
    platform: "macos" as const,
    width: 980,
    height: 640,
    clock: {},
  });
  await app.waitFor("id:clock-state");
  const clock = app.clock!;
  await app.press("id:clock-toggle-working");
  // Every mark of the twenty says its Bot is working; the character's own
  // motion is what says so, with no second badge drawn around it.
  expect(app.count("id:bot-mark-working")).toBe(20);
  const before = clockOf(app);
  await clock.runFor(300);
  const after = clockOf(app);
  // Nearly a frame apiece: the clock waits each one out rather than running
  // ahead, so a frame or two of the display is all that is missed.
  const span = after.time - before.time;
  expect(after.ticks - before.ticks).toBeGreaterThanOrEqual((span / 16) * 0.85);
});

test("reduced motion starts no loop and holds every mark at time 0", async () => {
  const app = await open("./avatar-b-clock-harness.tsx", {
    platform: "macos" as const,
    width: 980,
    height: 640,
    clock: {},
    reducedMotion: true,
  });
  await app.waitFor("id:clock-state");
  const clock = app.clock!;

  const still = () => clockOf(app);
  expect(still()).toEqual({ marks: 20, running: false, sleeping: false, ticks: 0, time: 0 });
  // Even a working mark asks for nothing: two seconds of the display pass and
  // the clock has published nothing at all.
  await app.press("id:clock-toggle-working");
  expect(app.count("id:bot-mark-working")).toBe(20);
  await clock.runFor(2000);
  expect(still()).toEqual({ marks: 20, running: false, sleeping: false, ticks: 0, time: 0 });
});

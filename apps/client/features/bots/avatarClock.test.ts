/**
 * The one clock, without a screen: however many marks ask for frames there is
 * one loop, it draws every frame while one of them works and only the frames a
 * resting mark needs otherwise, it sleeps between those, and the last mark out
 * stops it.
 *
 * Frames and timers both come from stand-ins here, so the test decides when the
 * display ticks and when a wait is over, and nothing waits on a real one. What
 * the app itself does — twenty marks on screen, a still picture under reduced
 * motion — is `screens/avatar-b-clock.test.tsx`, which reads the same state
 * through a harness screen.
 */
import { expect, test } from "nsh/test";

import { avatarMotion, type AvatarMotion } from "./avatar";
import { avatarClockState, avatarTime, watchAvatar, type AvatarWish } from "./avatarClock";

/** One mark's wish: working or not, and where its motion comes from. */
function wish(input: {
  working?: boolean;
  seed?: number;
  move?: (time: number) => AvatarMotion;
}): AvatarWish {
  const working = input.working ?? false;
  return {
    working: () => working,
    motion:
      input.move ?? ((time) => avatarMotion({ time, working: false, seed: input.seed ?? 0.2 })),
  };
}

/** The display and the timers, driven by the test; a second loop is a failure. */
function display() {
  const original = {
    frame: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
    later: globalThis.setTimeout,
    stop: globalThis.clearTimeout,
  };
  let now = 1_000;
  let armed: { id: number; run: (time: number) => void } | null = null;
  let waiting: { id: number; due: number; run: () => void } | null = null;
  let nextId = 1;
  let cancelled = 0;
  let loops = 0;

  globalThis.requestAnimationFrame = (run: (time: number) => void) => {
    if (armed) loops += 1;
    armed = { id: nextId++, run };
    return armed.id;
  };
  globalThis.cancelAnimationFrame = (id: number | undefined) => {
    if (armed && armed.id === id) {
      armed = null;
      cancelled += 1;
    }
  };
  globalThis.setTimeout = ((run: () => void, ms?: number) => {
    waiting = { id: nextId++, due: now + Math.max(0, ms ?? 0), run };
    return waiting.id;
  }) as unknown as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((id?: number) => {
    if (waiting && waiting.id === id) waiting = null;
  }) as unknown as typeof globalThis.clearTimeout;

  return {
    /** Frames waiting on the display: never more than one, one loop. */
    pending: () => (armed ? 1 : 0),
    /** Whether the clock is asleep on a timer rather than drawing. */
    waiting: () => (waiting ? 1 : 0),
    /** Milliseconds until the timer it sleeps on is due. */
    sleepFor: () => (waiting ? waiting.due - now : 0),
    cancelled: () => cancelled,
    loops: () => loops,
    /** Runs `ms` of display, a frame every 16, the timers due before each. */
    run(ms: number) {
      const until = now + ms;
      for (let step = 0; step < 2000 && now < until; step += 1) {
        now = Math.min(until, now + 16);
        while (waiting && waiting.due <= now) {
          const due = waiting;
          waiting = null;
          due.run();
        }
        const frame = armed;
        armed = null;
        frame?.run(now);
      }
    },
    restore() {
      globalThis.requestAnimationFrame = original.frame;
      globalThis.cancelAnimationFrame = original.cancel;
      globalThis.setTimeout = original.later;
      globalThis.clearTimeout = original.stop;
      waiting = null;
    },
  };
}

test("a mark at rest is drawn only when it moves, and the loop sleeps in between", () => {
  const frames = display();
  // Seed 0.55 neither blinks nor looks elsewhere in its first two seconds.
  const stop = watchAvatar(wish({ seed: 0.55 }));
  try {
    expect(avatarClockState().running).toBe(true);
    // The settle is drawn, and then nothing until the mark moves again.
    frames.run(600);
    const before = avatarClockState().ticks;
    frames.run(2000);
    expect(avatarClockState().ticks).toBe(before);
    expect(frames.waiting()).toBe(1);
    // Asleep on a timer, until the moment this mark next moves.
    expect(frames.sleepFor()).toBeGreaterThan(500);
  } finally {
    stop();
    frames.restore();
  }
});

test("twenty marks share one loop at the display's own rate, never one each", () => {
  const frames = display();
  const stops: (() => void)[] = [];
  // A fresh clock: the first mark starts the loop and the rest join it.
  for (let index = 0; index < 20; index++) {
    stops.push(watchAvatar(wish({ seed: index / 20 })));
  }
  try {
    expect(avatarClockState().marks).toBe(20);
    expect(avatarClockState().running).toBe(true);
    expect(frames.pending() + frames.waiting()).toBe(1);
    expect(frames.loops()).toBe(0);

    // Twenty marks blinking and glancing on their own phases keep the loop
    // busy — but at one frame per display frame, never twenty.
    const before = avatarClockState().ticks;
    frames.run(1000);
    const ticks = avatarClockState().ticks - before;
    expect(ticks).toBeLessThanOrEqual(1000 / 16 + 2);
    expect(frames.pending() + frames.waiting()).toBe(1);
    expect(frames.loops()).toBe(0);
  } finally {
    for (const stop of stops) stop();
    frames.restore();
  }
});

test("a mark that moves is drawn frame by frame, and then the loop sleeps again", () => {
  const frames = display();
  // One mark the test moves by hand: still until a second from now, moving for
  // 200 ms after (the clock carries its time across tests, so it is asked).
  const movesAt = avatarTime() + 1_000;
  const stopsAt = movesAt + 200;
  const stop = watchAvatar(
    wish({
      move: (time) =>
        time >= movesAt && time < stopsAt
          ? { moving: true, next: time }
          : { moving: false, next: time < movesAt ? movesAt : stopsAt },
    }),
  );
  try {
    frames.run(600);
    const settled = avatarClockState().ticks;
    frames.run(300);
    expect(avatarClockState().ticks).toBe(settled);
    expect(frames.waiting()).toBe(1);

    // The wait runs out and the mark moves: a frame apiece, at the display's
    // rate, for as long as it does.
    const before = avatarClockState().ticks;
    frames.run(300);
    const ticks = avatarClockState().ticks - before;
    expect(ticks).toBeGreaterThanOrEqual(10);
    expect(ticks).toBeLessThanOrEqual(300 / 16 + 2);
    // Over, and the loop is asleep again.
    expect(frames.waiting()).toBe(1);
  } finally {
    stop();
    frames.restore();
  }
});

test("one working mark draws every frame, and the rest follow it", () => {
  const frames = display();
  const stopIdle = watchAvatar(wish({ seed: 0.4, working: false }));
  const stopWorking = watchAvatar(wish({ working: true }));
  try {
    const before = avatarClockState().ticks;
    frames.run(500);
    const ticks = avatarClockState().ticks - before;
    // Every display frame of the half second, not only the moments a resting
    // mark would be drawn at.
    expect(ticks).toBeGreaterThanOrEqual(30);
    // A frame at a time, each waited out: the loop is never two frames ahead.
    expect(frames.pending() + frames.waiting()).toBe(1);
  } finally {
    stopIdle();
    stopWorking();
    frames.restore();
  }
});

test("the last mark out stops the loop, and its time stands still", () => {
  const frames = display();
  const stops = [watchAvatar(wish({ seed: 0.3 })), watchAvatar(wish({ working: true }))];
  const running = avatarTime();
  frames.run(200);
  try {
    expect(avatarClockState().running).toBe(true);
    for (const stop of stops) stop();
    expect(frames.pending()).toBe(0);
    expect(frames.waiting()).toBe(0);
    expect(avatarClockState().marks).toBe(0);
    expect(avatarClockState().running).toBe(false);

    const ticks = avatarClockState().ticks;
    const still = avatarTime();
    frames.run(500);
    expect(avatarClockState().ticks).toBe(ticks);
    expect(avatarTime()).toBe(still);
    // The time it had already drawn is not thrown away: a mark that comes back
    // carries on rather than restarts under a blink.
    expect(still).toBeGreaterThan(running);
  } finally {
    for (const stop of stops) stop();
    frames.restore();
  }
});

test("a mark that leaves twice, or asks while another runs, still leaves one loop", () => {
  const frames = display();
  const stop = watchAvatar(wish({ seed: 0.1 }));
  const again = watchAvatar(wish({ seed: 0.6 }));
  try {
    frames.run(100);
    stop();
    stop();
    expect(frames.pending() + frames.waiting()).toBe(1);
    again();
    expect(frames.pending()).toBe(0);
    expect(frames.loops()).toBe(0);
  } finally {
    stop();
    again();
    frames.restore();
  }
});

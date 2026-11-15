/**
 * One clock for every identity mark in the app, and one display frame's work
 * for all of them.
 *
 * A mark asks for frames while it is on screen (`watchAvatar`), says whether a
 * turn of its Bot is running and, at rest, when it will next move. The first
 * mark starts the one loop and the last one stops it, so twenty marks on screen
 * cost one loop, not twenty — and a screen whose marks are all still costs no
 * frames at all: the loop sleeps until the next blink or glance is due, which
 * is what keeps a resting app idle (and a test's steps quick).
 *
 * A working mark breathes and scans, so its frames are every frame.
 *
 * Reduced motion stops the loop and holds every mark at `time` 0: the still
 * pose in `avatar.ts`, with no blink, no glance and no breath. Turning the
 * setting on or off takes effect at the next read, since a mark's canvas reads
 * this (and so re-draws) when the setting changes.
 */
import { computed, reduceMotion, signal } from "nsh";

import type { AvatarMotion } from "./avatar";

/** How often a moving mark is drawn: one display frame. */
const FRAME_MS = 16;

/** One mark's wish for frames: whether its Bot is working, and when it next moves. */
export type AvatarWish = {
  /** A turn of this mark's Bot is running: every frame, not only the next one. */
  working: () => boolean;
  /** What this mark is doing at `time`, and when it next differs. */
  motion: (time: number) => AvatarMotion;
};

/** The marks' time, in milliseconds since they began moving. */
const clock = signal(0);

/** The one moment every mark is held at, while a picture needs one; null is the live clock. */
const held = signal<number | null>(null);

/** The marks that asked for frames. */
const marks = new Set<AvatarWish>();

/** The one loop's handle, while a frame is armed. */
let handle: number | undefined;
/** The timer that wakes the loop again, while it sleeps between a mark's moves. */
let wake: ReturnType<typeof setTimeout> | undefined;
/** Milliseconds drawn before this run of the loop began, and the frame it began at. */
let base = 0;
let beganAt: number | undefined;

const markCount = signal(0);
/** The clock's time as last drawn, which is what the frame rate steps from. */
let drawn = 0;
const live = signal(false);
const sleeping = signal(false);
const ticks = signal(0);

/** What the one clock is doing: how many marks it serves, and its work so far. */
export type AvatarClockState = {
  /** Marks asking for frames. */
  marks: number;
  /** Whether marks are asking at all (they are not while reduced motion holds them). */
  running: boolean;
  /** Whether the loop is asleep between moves rather than drawing. */
  sleeping: boolean;
  /** Frames it has published since the app started. */
  ticks: number;
};

const state = computed<AvatarClockState>(() => ({
  marks: markCount(),
  running: live(),
  sleeping: sleeping(),
  ticks: ticks(),
}));

/**
 * The clock's state. A harness reads it through the screen, since an app's
 * modules are not a test's; nothing in the product draws it.
 */
export function avatarClockState(): AvatarClockState {
  return state();
}

/**
 * The marks' time in milliseconds. It stands at 0 while reduced motion is on —
 * every mark then draws its still pose — and a read of it is also what starts
 * the loop again once the setting is turned off. A held moment (`holdAvatarClock`)
 * overrides both: every mark draws that one frame and the loop rests.
 */
export function avatarTime(): number {
  const moment = held();
  if (moment !== null) return moment;
  if (reduceMotion()) return 0;
  if (marks.size > 0) start();
  return clock();
}

/**
 * Holds every mark at `time`, for a picture that has to be the same one twice:
 * the loop stops, each mark draws that frame, and the app goes quiet, so a test
 * may wait on it again. `null` lets the clock run on from where it was. A mark
 * drawn at an explicit `time` of its own ignores this: it draws that moment.
 */
export function holdAvatarClock(time: number | null): void {
  held.set(time === null ? null : Math.max(0, time));
  if (time !== null) pause();
}

/**
 * Asks for the clock's frames for one mark. The returned function stops asking
 * (a mark that leaves the screen), and the last one out stops the loop.
 */
export function watchAvatar(wish: AvatarWish): () => void {
  marks.add(wish);
  markCount.set(marks.size);
  if (!reduceMotion() && held() === null) start();
  let watching = true;
  return () => {
    if (!watching) return;
    watching = false;
    marks.delete(wish);
    markCount.set(marks.size);
    if (marks.size === 0) pause();
  };
}

function start(): void {
  if (marks.size === 0 || reduceMotion() || held() !== null) return;
  live.set(true);
  // Already drawing, or already asleep until the next move: nothing to do.
  if (handle !== undefined || wake !== undefined) return;
  handle = requestAnimationFrame(frame);
}

/** Stops the one loop, keeping the time drawn so far. */
function pause(): void {
  if (handle !== undefined) cancelAnimationFrame(handle);
  if (wake !== undefined) clearTimeout(wake);
  handle = undefined;
  wake = undefined;
  beganAt = undefined;
  base = clock();
  live.set(false);
  sleeping.set(false);
}

/** Wakes the loop in `ms`, the wait until the next mark moves. */
function sleep(ms: number): void {
  if (wake !== undefined || handle !== undefined) return;
  sleeping.set(true);
  wake = setTimeout(
    () => {
      wake = undefined;
      sleeping.set(false);
      start();
    },
    Math.max(1, ms),
  );
}

function frame(stamp: number): void {
  handle = undefined;
  if (marks.size === 0 || reduceMotion() || held() !== null) {
    // Reduced motion puts every mark back where it started; the next read
    // starts the clock over, and the motion eases in from the still pose.
    if (reduceMotion()) {
      clock.set(0);
      drawn = 0;
    }
    pause();
    return;
  }
  if (beganAt === undefined) beganAt = stamp;
  const now = base + (stamp - beganAt);
  const due = nextMove(now);
  if (due <= now) {
    // A frame is due here, unless the display is running ahead of itself (a
    // test's frames come as fast as the code allows): then wait out the rest of
    // the frame, which is what lets the app be quiet between two draws.
    const early = now - drawn;
    if (early < FRAME_MS) {
      sleep(FRAME_MS - early);
      return;
    }
    drawn = now;
    clock.set(now);
    ticks.update((count) => count + 1);
  }
  // A mark working or moving is drawn every frame; otherwise the loop sleeps
  // until the next blink or glance, and the app rests in between.
  sleep(Math.max(FRAME_MS, due - now));
}

/** The next time some mark differs from its picture at `now`; `now` if one is moving. */
function nextMove(now: number): number {
  let due = Infinity;
  for (const mark of marks) {
    const motion = mark.motion(now);
    if (motion.moving || mark.working()) return now;
    if (motion.next < due) due = motion.next;
  }
  return Number.isFinite(due) ? due : now;
}

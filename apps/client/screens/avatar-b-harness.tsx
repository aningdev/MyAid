/**
 * Test-only entry for batch B's pictures: the character's motion, drawn at the
 * moments the batch agreed. Three sheets, one tab each —
 *
 * - **working**: four bodies at the eight moments of one breath;
 * - **idle**: a blink's beginning, its middle and its end, on a dot, an arch
 *   and a line face, plus the gaze's drift;
 * - **morph**: a body changing into another and a face into a different kind.
 *
 * Every cell draws a mark at a stated moment (`BotAvatar`'s `time`): no clock is
 * involved, so a sheet is the same picture however often it is taken. Nothing
 * in the product imports this file; `screens/avatar-b-shots.test.tsx` opens it.
 */
import { mount, signal, Text, token, View } from "nsh";

import { Pressable } from "../components/ui/pressable";
import { avatarPose, markSeed } from "../features/bots/avatar";
import { BotAvatar } from "../features/bots/BotMark";
import {
  BOT_FACE_LABELS,
  BOT_SHAPE_LABELS,
  type BotFace,
  type BotShape,
} from "../features/bots/identity";
import { t } from "../lib/i18n";

/** The sheets the test walks. */
const SHEETS = ["working", "idle", "morph"] as const;
type Sheet = (typeof SHEETS)[number];

/** The bodies the working sheet draws: one round, three that pinch the face. */
const WORKING_SHAPES = ["round", "triangle", "drop", "star"] as const;

/** One breath is 1.6 s; the eight moments that divide it, in milliseconds. */
const BREATH_MOMENTS = [0, 200, 400, 600, 800, 1000, 1200, 1400] as const;

/** The faces whose blink reads differently: a dot, an arch and a line. */
const BLINK_FACES = ["calm", "happy", "sleepy"] as const;

/** The accent every cell is drawn in: one mark's colour, so the shape is the subject. */
const ACCENT = { color: "teal" } as const;

function identityOf(shape: BotShape, face: BotFace) {
  return { ...ACCENT, shape, face };
}

/**
 * When this mark blinks: the moment its eyes are shut tightest, found by asking
 * the pose the same question a frame asks it, so the sheet cannot drift from
 * what the app draws.
 */
function deepestShut(face: BotFace): number {
  const seed = markSeed(identityOf("round", face));
  let best = 0;
  let when = 0;
  for (let time = 0; time <= 16000; time += 1) {
    const shut = avatarPose({ time, working: false, seed }).shut;
    if (shut > best) {
      best = shut;
      when = time;
    }
  }
  return when;
}

function Harness() {
  const sheet = signal<Sheet>("working");
  return (
    <View
      testID="avatar-b-harness"
      style={{ flex: 1, backgroundColor: token("background"), padding: 20, gap: 14 }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Each of={SHEETS}>
          {(name) => (
            <Pressable
              onPress={() => sheet.set(name())}
              selected={sheet() === name()}
              accessibilityLabel={`Sheet ${name()}`}
              testID={`sheet-${name()}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: sheet() === name() ? token("foreground") : token("border"),
                backgroundColor: token("raised"),
              }}
            >
              <Text style={{ fontSize: 12, color: token("foreground") }}>{name()}</Text>
            </Pressable>
          )}
        </Each>
      </View>
      <If when={sheet() === "working"}>{() => <WorkingSheet />}</If>
      <If when={sheet() === "idle"}>{() => <IdleSheet />}</If>
      <If when={sheet() === "morph"}>{() => <MorphSheet />}</If>
    </View>
  );
}

/** Four bodies, each at every moment of one breath: the body's stretch and the scan. */
function WorkingSheet() {
  const cell = 64;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ width: 64 }} />
        <Each of={BREATH_MOMENTS}>
          {(moment) => (
            <View style={{ width: cell, alignItems: "center" }}>
              <Text
                style={{ fontSize: 9, color: token("muted-foreground") }}
              >{`${moment()}ms`}</Text>
            </View>
          )}
        </Each>
      </View>
      <Each of={WORKING_SHAPES}>
        {(shape) => (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Text style={{ width: 64, fontSize: 9, color: token("muted-foreground") }}>
              {t(BOT_SHAPE_LABELS[shape()])}
            </Text>
            <Each of={BREATH_MOMENTS}>
              {(moment) => (
                <View
                  testID={`work-${shape()}-${moment()}`}
                  style={{
                    width: cell,
                    height: cell,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BotAvatar
                    identity={identityOf(shape(), "calm")}
                    size={48}
                    working
                    time={moment()}
                  />
                </View>
              )}
            </Each>
          </View>
        )}
      </Each>
    </View>
  );
}

/** A blink from before to after, on the three kinds of eye; then the gaze's drift. */
function IdleSheet() {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ width: 96 }} />
        <Each of={["open", "closing", "shut", "opening", "open"]}>
          {(label) => (
            <View style={{ width: 80, alignItems: "center" }}>
              <Text style={{ fontSize: 9, color: token("muted-foreground") }}>{label()}</Text>
            </View>
          )}
        </Each>
      </View>
      <Each of={BLINK_FACES}>
        {(face) => {
          const middle = deepestShut(face());
          return (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={{ width: 96, fontSize: 9, color: token("muted-foreground") }}>
                {t(BOT_FACE_LABELS[face()])}
              </Text>
              <Each of={[middle - 120, middle - 38, middle, middle + 38, middle + 120]}>
                {(moment, index) => (
                  <View
                    testID={`blink-${face()}-${index()}`}
                    style={{
                      width: 80,
                      height: 80,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BotAvatar identity={identityOf("round", face())} size={56} time={moment()} />
                  </View>
                )}
              </Each>
            </View>
          );
        }}
      </Each>
      {/* At rest: the eyes' drift alone, six steps of its long slow turn. */}
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Text style={{ width: 96, fontSize: 9, color: token("muted-foreground") }}>
          {t(BOT_FACE_LABELS.calm)}
        </Text>
        <Each of={[0, 1200, 2400, 3600, 4800, 6000]}>
          {(moment) => (
            <View
              testID={`drift-${moment()}`}
              style={{ width: 80, height: 80, alignItems: "center", justifyContent: "center" }}
            >
              <BotAvatar identity={identityOf("round", "calm")} size={56} time={moment()} />
            </View>
          )}
        </Each>
      </View>
    </View>
  );
}

/** A body becoming another, and a dot face becoming an arch one: the boundaries between. */
function MorphSheet() {
  const steps = [0, 0.5, 1] as const;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Text style={{ width: 96, fontSize: 9, color: token("muted-foreground") }}>
          round → star
        </Text>
        <Each of={steps}>
          {(progress) => (
            <View
              testID={`morph-shape-${progress()}`}
              style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}
            >
              <BotAvatar
                identity={identityOf("star", "calm")}
                size={72}
                time={600}
                from={{ shape: "round", face: "calm", progress: progress() }}
              />
            </View>
          )}
        </Each>
      </View>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Text style={{ width: 96, fontSize: 9, color: token("muted-foreground") }}>
          calm → happy
        </Text>
        <Each of={steps}>
          {(progress) => (
            <View
              testID={`morph-face-${progress()}`}
              style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}
            >
              <BotAvatar
                identity={identityOf("dome", "happy")}
                size={72}
                time={600}
                from={{ shape: "dome", face: "calm", progress: progress() }}
              />
            </View>
          )}
        </Each>
      </View>
    </View>
  );
}

mount(Harness);

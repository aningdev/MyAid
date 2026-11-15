/**
 * Test-only entry: the real identity picker, its marks held at the moments a
 * change of form passes through — the press on "star" draws the first frame,
 * and the strip below moves the one moment every mark is frozen at, so a
 * picture can be taken a quarter of the way through the change and half.
 *
 * The hold is the app's own (`holdAvatarClock`), not the test's, because the
 * morph is measured in the clock's time: with it standing at 0 when the press
 * lands, the first frame is the old form and the frames after it are the ease
 * as the app draws it. Nothing in the product imports this file;
 * `screens/avatar-b-shots.test.tsx` opens it.
 */
import { mount, signal, Text, token, View } from "nsh";

import { Pressable } from "../components/ui/pressable";
import { holdAvatarClock } from "../features/bots/avatarClock";
import { BotAvatar, BotIdentityPicker } from "../features/bots/BotMark";
import type { BotIdentity } from "../features/bots/identity";

/** The moments the change is frozen at: its start, its middle and its end. */
const MOMENTS = [
  { time: 0, label: "start" },
  { time: 60, label: "middle" },
  { time: 400, label: "end" },
] as const;

function Harness() {
  const current = signal<BotIdentity>({ color: "teal", shape: "round", face: "calm" });
  const moment = signal(0);
  holdAvatarClock(0);
  return (
    <View
      testID="avatar-b-picker-harness"
      style={{ flex: 1, backgroundColor: token("background") }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: token("line"),
        }}
      >
        <Text style={{ fontSize: 11, color: token("muted-foreground") }}>held at</Text>
        <Each of={MOMENTS}>
          {(step) => (
            <Pressable
              testID={`moment-${step().label}`}
              onPress={() => {
                moment.set(step().time);
                holdAvatarClock(step().time);
              }}
              selected={moment() === step().time}
              accessibilityLabel={`Hold the change at its ${step().label}`}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: moment() === step().time ? token("foreground") : token("border"),
              }}
            >
              <Text style={{ fontSize: 11, color: token("foreground") }}>{step().label}</Text>
            </Pressable>
          )}
        </Each>
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: 28, padding: 20 }}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <BotAvatar identity={() => current()} size={64} />
            <BotAvatar identity={() => current()} size={22} />
          </View>
          <View style={{ width: 300 }}>
            <BotIdentityPicker identity={() => current()} onChange={(next) => current.set(next)} />
          </View>
        </View>
      </View>
    </View>
  );
}

mount(Harness);

/**
 * Test-only entry: twenty marks on one screen, beside the one clock's state —
 * how many marks it serves, whether its loop runs, whether it is asleep between
 * their moves, and how many frames it has published. Nothing in the product
 * imports it; `screens/avatar-b-clock.test.tsx` opens it to prove that twenty
 * marks cost one loop at the display's rate, that a resting screen leaves the
 * app quiet, that the last mark leaving stops the loop, and that reduced motion
 * starts it not at all.
 */
import { mount, signal, Text, token, View } from "nsh";

import { Pressable } from "../components/ui/pressable";
import { avatarClockState, avatarTime } from "../features/bots/avatarClock";
import { BotMark } from "../features/bots/BotMark";
import { BOT_COLORS, BOT_FACES, BOT_SHAPES, type BotIdentity } from "../features/bots/identity";

/** Twenty marks, each its own identity, so each keeps its own phase. */
const MARKS: BotIdentity[] = Array.from({ length: 20 }, (_, index) => ({
  color: BOT_COLORS[index % BOT_COLORS.length] ?? "indigo",
  shape: BOT_SHAPES[index % BOT_SHAPES.length] ?? "round",
  face: BOT_FACES[(index * 5) % BOT_FACES.length] ?? "calm",
}));

function Harness() {
  const shown = signal(true);
  const working = signal(false);
  const stateLine = () => {
    const state = avatarClockState();
    return `marks=${state.marks} running=${state.running} sleeping=${state.sleeping} ticks=${state.ticks} time=${Math.round(avatarTime())}`;
  };
  return (
    <View
      testID="clock-harness"
      style={{ flex: 1, backgroundColor: token("background"), padding: 20, gap: 12 }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          testID="clock-toggle-marks"
          onPress={() => shown.set(!shown())}
          accessibilityLabel="Toggle marks"
          style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: token("raised") }}
        >
          <Text style={{ fontSize: 12, color: token("foreground") }}>Marks</Text>
        </Pressable>
        <Pressable
          testID="clock-toggle-working"
          onPress={() => working.set(!working())}
          accessibilityLabel="Toggle working"
          selected={working()}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: working() ? token("foreground") : token("border"),
            backgroundColor: token("raised"),
          }}
        >
          <Text style={{ fontSize: 12, color: token("foreground") }}>Working</Text>
        </Pressable>
      </View>
      <Text testID="clock-state" style={{ fontSize: 12, color: token("foreground") }}>
        {stateLine()}
      </Text>
      <If when={shown()}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Each
            of={MARKS}
            key={(identity) => `${identity.color}/${identity.shape}/${identity.face}`}
          >
            {(identity) => <BotMark identity={identity()} size={22} working={working()} />}
          </Each>
        </View>
      </If>
    </View>
  );
}

mount(Harness);

/**
 * Test-only entry for the avatar batch's pictures: the character's contact
 * sheets — every body against every face, at the sizes the app draws, then the
 * narrow bodies large — in one window whose tab a press changes. Nothing in
 * the product imports it; `screens/avatar-a-shots.test.tsx` opens it.
 */
import { mount, signal, Text, token, View } from "nsh";

import { Pressable } from "../components/ui/pressable";
import { BotAvatar } from "../features/bots/BotMark";
import {
  BOT_COLORS,
  BOT_FACE_LABELS,
  BOT_FACES,
  BOT_SHAPE_LABELS,
  BOT_SHAPES,
  type BotIdentity,
} from "../features/bots/identity";
import { t } from "../lib/i18n";

/** The sheets the test walks: the three contact sizes, then the close-ups. */
const SHEETS = ["48", "22", "16", "96"] as const;
type Sheet = (typeof SHEETS)[number];

/** The bodies that pinch the face, drawn large to prove the eyes stay whole. */
const NARROW = ["triangle", "dome", "drop", "star"] as const;
const CLOSE_FACES = ["calm", "curious"] as const;

/** Row `index` of every sheet uses the next accent, so all eight colors show. */
function identityOf(row: number, face: number): BotIdentity {
  return {
    color: BOT_COLORS[row % BOT_COLORS.length] ?? "indigo",
    shape: BOT_SHAPES[row % BOT_SHAPES.length] ?? "round",
    face: BOT_FACES[face % BOT_FACES.length] ?? "calm",
  };
}

function Harness() {
  const sheet = signal<Sheet>("48");
  return (
    <View
      testID="avatar-a-harness"
      style={{
        flex: 1,
        backgroundColor: token("background"),
        padding: 20,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Each of={SHEETS}>
          {(size) => (
            <Pressable
              onPress={() => sheet.set(size())}
              selected={sheet() === size()}
              accessibilityLabel={`Sheet ${size()}`}
              testID={`sheet-${size()}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: sheet() === size() ? token("foreground") : token("border"),
                backgroundColor: token("raised"),
              }}
            >
              <Text style={{ fontSize: 12, color: token("foreground") }}>{`${size()}px`}</Text>
            </Pressable>
          )}
        </Each>
      </View>
      {/* A sheet's size is fixed, so each one is its own branch: a press swaps the whole sheet. */}
      <If when={sheet() === "48"}>{() => <ContactSheet size={48} />}</If>
      <If when={sheet() === "22"}>{() => <ContactSheet size={22} />}</If>
      <If when={sheet() === "16"}>{() => <ContactSheet size={16} />}</If>
      <If when={sheet() === "96"}>{() => <CloseUps />}</If>
    </View>
  );
}

/** Every body in every face, one accent a row, the names down and across. */
function ContactSheet(props: { size: number }) {
  // The cells keep room for the caption of a small mark, so the sheet stays legible.
  const cell = Math.max(props.size, 36);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Each of={BOT_FACES}>
            {(face) => (
              <View style={{ width: cell, alignItems: "center" }}>
                <Text style={{ fontSize: 9, color: token("muted-foreground") }}>
                  {t(BOT_FACE_LABELS[face()])}
                </Text>
              </View>
            )}
          </Each>
        </View>
        <Each of={BOT_SHAPES}>
          {(shape, row) => (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Each of={BOT_FACES}>
                {(face, column) => (
                  <View
                    testID={`cell-${shape()}-${face()}`}
                    style={{
                      width: cell,
                      height: cell,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BotAvatar identity={identityOf(row(), column())} size={props.size} />
                  </View>
                )}
              </Each>
              <Text style={{ fontSize: 9, color: token("muted-foreground"), width: 62 }}>
                {t(BOT_SHAPE_LABELS[shape()])}
              </Text>
            </View>
          )}
        </Each>
      </View>
    </View>
  );
}

/** The four narrow bodies at 96px, calm and curious: the eyes cut whole. */
function CloseUps() {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 24 }}>
        <Each of={CLOSE_FACES}>
          {(face) => (
            <Text style={{ fontSize: 10, color: token("muted-foreground"), width: 100 }}>
              {t(BOT_FACE_LABELS[face()])}
            </Text>
          )}
        </Each>
      </View>
      <Each of={NARROW}>
        {(shape, row) => (
          <View style={{ flexDirection: "row", gap: 24, alignItems: "center" }}>
            <Each of={CLOSE_FACES}>
              {(face, column) => (
                <View
                  testID={`close-${shape()}-${face()}`}
                  style={{
                    width: 100,
                    height: 100,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BotAvatar
                    identity={{
                      color: BOT_COLORS[row() % BOT_COLORS.length] ?? "indigo",
                      shape: shape(),
                      face: face(),
                    }}
                    size={96}
                  />
                </View>
              )}
            </Each>
            <Text style={{ fontSize: 10, color: token("muted-foreground") }}>
              {t(BOT_SHAPE_LABELS[shape()])}
            </Text>
          </View>
        )}
      </Each>
    </View>
  );
}

mount(Harness);

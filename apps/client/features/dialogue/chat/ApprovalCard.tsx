/**
 * A tool call waiting on the person, inline at the end of the transcript:
 * what the tool wants to do, Allow once, Deny, and the keys that do the same
 * (Return allows, Escape denies, unless a text input has the keyboard).
 * Answered, it folds into a one-line record of what was decided.
 */
import { cleanup, effect, keymap, signal, Text, View } from "nsh";

import { alpha, colors, finish, Press, radius, toneTint } from "../../../components/ui";
import type { ApprovalRequest } from "../session/claimed";
import type { SessionController } from "../session/controller";
import { Glyph } from "./glyphs";

type Answered = { tool: string; allowed: boolean };

export function ApprovalCard(props: { controller: () => SessionController }) {
  const record = signal<Answered | null>(null);
  const request = () => props.controller().pendingApproval();

  // A new request clears what the last one recorded.
  effect(() => {
    if (request()) record.set(null);
  });

  const answer = (allowed: boolean) => {
    const tool = request()?.toolName || "the tool";
    record.set({ tool, allowed });
    props.controller().answerApproval(allowed ? "allowed-once" : "rejected");
  };

  return (
    <If when={!!request()} else={<AnsweredLine record={record} />}>
      <Card request={request} onAnswer={answer} />
    </If>
  );
}

function Card(props: {
  request: () => ApprovalRequest | null;
  onAnswer: (allowed: boolean) => void;
}) {
  const req = () => props.request();

  effect(() => {
    const off = [
      keymap.bind("return", () => props.onAnswer(true), { when: "notEditing" }),
      keymap.bind("escape", () => props.onAnswer(false), { when: "notEditing" }),
    ];
    cleanup(() => {
      for (const remove of off) remove();
    });
  });

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        gap: 8,
        borderRadius: radius.card,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        ...finish.card,
        borderWidth: 1,
        borderColor: alpha(colors.warn, 0.45),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: toneTint("warn"),
          }}
        >
          <Glyph name="alert" size={13} tint={colors.warn} />
        </View>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.text }}>
          {`Allow ${req()?.toolName || "this tool"}?`}
        </Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.muted }}>
        {req()?.reason || "This call needs your permission."}
      </Text>
      <If when={!!req()?.details}>
        <Text style={{ fontSize: 12, lineHeight: 17, color: colors.faint }}>{req()?.details}</Text>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Press onPress={() => props.onAnswer(true)} accessibilityLabel="Allow once" scale={0.97}>
          <View
            style={{
              height: 30,
              paddingHorizontal: 12,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.light,
              ...finish.light,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onLight }}>
              Allow once
            </Text>
          </View>
        </Press>
        <Press onPress={() => props.onAnswer(false)} accessibilityLabel="Deny" scale={0.97}>
          <View
            style={{
              height: 30,
              paddingHorizontal: 12,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.raised,
              ...finish.raised,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Deny</Text>
          </View>
        </Press>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 11, color: colors.faint }}>Return allows · Esc denies</Text>
      </View>
    </View>
  );
}

/** What was decided, on one line, until the next request. */
function AnsweredLine(props: { record: () => Answered | null }) {
  return (
    <If when={!!props.record()}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginBottom: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: radius.control,
          borderCurve: "continuous",
          backgroundColor: colors.inset,
        }}
      >
        <Glyph
          name={props.record()?.allowed ? "check" : "close"}
          size={12}
          tint={props.record()?.allowed ? colors.up : colors.muted}
        />
        <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>
          {props.record()?.allowed
            ? `Allowed ${props.record()?.tool}`
            : `Denied ${props.record()?.tool}`}
        </Text>
      </View>
    </If>
  );
}

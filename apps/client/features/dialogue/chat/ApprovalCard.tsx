/**
 * A tool call waiting on the person, inline at the end of the transcript:
 * what the tool wants to do, Allow once, Deny, and the keys that do the same
 * (Return allows, Escape denies, unless a text input has the keyboard).
 * Answered, it folds into a one-line record of what was decided.
 */
import { TriangleAlert } from "lucide";
import { cleanup, effect, keymap, signal, Text, View, token } from "nsh";

import { Button } from "../../../components/ui/button";
import { t } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { alpha, radius, toneTint } from "../../../lib/theme";
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
    const tool = request()?.toolName || t("dsh.error.tool");
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
        backgroundColor: token("card"),
        borderWidth: 1,
        borderColor: alpha(token("warn"), 0.45),
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
          <Icon icon={TriangleAlert} size={13} tint={token("warn")} />
        </View>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: token("foreground") }}>
          {t("chat.allowTool", { tool: req()?.toolName || t("dsh.error.tool") })}
        </Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 18, color: token("muted-foreground") }}>
        {req()?.reason || t("chat.permission")}
      </Text>
      <If when={!!req()?.details}>
        <Text style={{ fontSize: 12, lineHeight: 17, color: token("faint") }}>
          {req()?.details}
        </Text>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button
          onPress={() => props.onAnswer(true)}
          accessibilityLabel={t("chat.allowOnce")}
        >
          {t("chat.allowOnce")}
        </Button>
        <Button
          variant="secondary"
          onPress={() => props.onAnswer(false)}
          accessibilityLabel={t("chat.deny")}
        >
          {t("chat.deny")}
        </Button>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 11, color: token("faint") }}>{t("chat.approvalKeys")}</Text>
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
          backgroundColor: token("inset"),
        }}
      >
        <Glyph
          name={props.record()?.allowed ? "check" : "close"}
          size={12}
          tint={props.record()?.allowed ? token("up") : token("muted-foreground")}
        />
        <Text style={{ flex: 1, fontSize: 12, color: token("muted-foreground") }}>
          {props.record()?.allowed
            ? `Allowed ${props.record()?.tool}`
            : `Denied ${props.record()?.tool}`}
        </Text>
      </View>
    </If>
  );
}

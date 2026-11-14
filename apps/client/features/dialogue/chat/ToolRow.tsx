/**
 * Tool calls in the transcript: one compact row per call (collapsed to its
 * verb and target, expanding to the arguments and the result), and a group
 * of consecutive calls as "N steps". Reasoning is the collapsed row above
 * them. Expansion lives in the Pane: list rows are recycled.
 */
import { Brain, ChevronDown, Terminal } from "lucide";
import { Text, View, token } from "nsh";

import { Press } from "../../../components/app";
import { t, type MessageKey } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { alpha, isDark, mono, radius, toneTint } from "../../../lib/theme";
import { Spinner } from "./parts";
import { stepsLabel, toolDisplayState, toolSummary, type ToolDisplayState } from "./rows";
import type { Tool } from "./scripts";

const ROW_HEIGHT = 30;

const stateLabel: Record<ToolDisplayState, MessageKey> = {
  pending: "chat.toolState.queued",
  running: "chat.toolState.running",
  done: "chat.toolState.done",
  failed: "chat.toolState.failed",
  cut: "chat.toolState.cut",
};

const stateTint = (state: ToolDisplayState) =>
  state === "failed" ? token("destructive") : state === "cut" ? token("warn") : token("faint");

const monoBody = () => ({
  userSelect: "text" as const,
  fontFamily: mono,
  fontSize: 12,
  lineHeight: 18,
  color: token("code"),
});

/** One call: a line at rest, its arguments and result once opened. */
export function ToolRow(props: { tool: () => Tool; open: () => boolean; onToggle: () => void }) {
  const state = () => toolDisplayState(props.tool());
  const summary = () => toolSummary(props.tool());
  return (
    <View style={{ gap: 4 }}>
      <Press
        onPress={props.onToggle}
        scale={0.995}
        accessibilityLabel={t("chat.tool", { name: props.tool().name })}
        accessibilityState={{ selected: props.open() }}
        style={{ borderRadius: radius.control }}
        hoverStyle={{ backgroundColor: alpha(token("foreground"), 0.04) }}
      >
        <View
          style={{
            height: ROW_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 6,
            borderRadius: radius.control,
            borderCurve: "continuous",
          }}
        >
          <If
            when={state() === "running" || state() === "pending"}
            else={<Icon icon={Terminal} size={13} tint={token("faint")} />}
          >
            <Spinner size={12} tint={token("info")} />
          </If>
          <Text
            style={{
              numberOfLines: 1,
              fontSize: 13,
              fontWeight: "600",
              color: token("foreground"),
            }}
          >
            {summary().verb}
          </Text>
          <If when={!!summary().target}>
            <Text
              style={{ numberOfLines: 1, flex: 1, fontSize: 13, color: token("muted-foreground") }}
            >
              {summary().target}
            </Text>
          </If>
          <If when={!summary().target}>
            <View style={{ flex: 1 }} />
          </If>
          <Text style={{ fontSize: 12, color: stateTint(state()) }}>{t(stateLabel[state()])}</Text>
          <View
            style={{
              transform: [{ rotate: props.open() ? "0deg" : "-90deg" }],
              transitionProperty: "transform",
              transitionDuration: 180,
              transitionTimingFunction: "ease-out",
            }}
          >
            <Icon icon={ChevronDown} size={12} tint={token("faint")} />
          </View>
        </View>
      </Press>
      <If when={props.open()}>
        <View
          style={{
            marginLeft: 6,
            gap: 6,
            paddingBottom: 4,
            paddingLeft: 10,
            borderLeftWidth: 1,
            borderLeftColor: token("line"),
          }}
        >
          <If when={!!props.tool().arguments}>
            <View
              style={{
                padding: 8,
                borderRadius: radius.control,
                borderCurve: "continuous",
                backgroundColor: token("inset"),
              }}
            >
              <Text style={monoBody()}>{props.tool().arguments}</Text>
            </View>
          </If>
          <If when={props.tool().result !== undefined || state() === "failed" || state() === "cut"}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, color: stateTint(state()) }}>
                {state() === "failed"
                  ? t("common.error")
                  : state() === "cut"
                    ? t("chat.toolState.cut")
                    : t("common.result")}
              </Text>
              <Text
                style={{
                  ...monoBody(),
                  color: state() === "failed" ? token("destructive") : monoBody().color,
                }}
              >
                {props.tool().result?.trim() ||
                  (state() === "cut" ? t("chat.toolCutLong") : t("common.empty"))}
              </Text>
            </View>
          </If>
        </View>
      </If>
    </View>
  );
}

/** Consecutive calls read as one "N steps" row until opened. */
export function StepGroup(props: {
  tools: () => readonly Tool[];
  open: () => boolean;
  onToggle: () => void;
  isOpen: (id: string) => boolean;
  onToggleTool: (id: string) => void;
}) {
  const failed = () => props.tools().some((tool) => toolDisplayState(tool) === "failed");
  const running = () =>
    props.tools().some((tool) => {
      const state = toolDisplayState(tool);
      return state === "running" || state === "pending";
    });
  return (
    <View style={{ gap: 2 }}>
      <Press
        onPress={props.onToggle}
        scale={0.995}
        accessibilityLabel={`${stepsLabel(props.tools())}, ${
          props.open() ? t("chat.stepsCollapse") : t("chat.stepsExpand")
        }`}
        accessibilityState={{ selected: props.open() }}
        style={{ borderRadius: radius.control }}
        hoverStyle={{ backgroundColor: alpha(token("foreground"), 0.04) }}
      >
        <View
          style={{
            height: ROW_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 6,
            borderRadius: radius.control,
            borderCurve: "continuous",
          }}
        >
          <If when={running()} else={<Icon icon={Terminal} size={13} tint={token("faint")} />}>
            <Spinner size={12} tint={token("info")} />
          </If>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: token("foreground") }}>
            {stepsLabel(props.tools())}
          </Text>
          <If when={failed() && !running()}>
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 6,
                backgroundColor: toneTint("danger"),
              }}
            >
              <Text style={{ fontSize: 11, color: token("destructive") }}>
                {t("chat.toolState.failed")}
              </Text>
            </View>
          </If>
          <View
            style={{
              transform: [{ rotate: props.open() ? "0deg" : "-90deg" }],
              transitionProperty: "transform",
              transitionDuration: 180,
              transitionTimingFunction: "ease-out",
            }}
          >
            <Icon icon={ChevronDown} size={12} tint={token("faint")} />
          </View>
        </View>
      </Press>
      <If when={props.open()}>
        <View
          style={{
            marginLeft: 12,
            paddingLeft: 6,
            borderLeftWidth: 1,
            borderLeftColor: token("line"),
            backgroundColor: isDark() ? undefined : alpha(token("foreground"), 0.015),
            borderRadius: radius.control,
          }}
        >
          <Each of={props.tools()} key={(tool) => tool.id}>
            {(tool) => (
              <ToolRow
                tool={tool}
                open={() => props.isOpen(tool().id)}
                onToggle={() => props.onToggleTool(tool().id)}
              />
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}

/** "Thought for 12s": the reasoning, folded away until asked for. */
export function ThinkingRow(props: {
  text: () => string;
  seconds: () => number;
  live: false | "thinking" | "done";
  open: () => boolean;
  onToggle: () => void;
}) {
  const label = () => {
    if (props.live === "thinking") {
      return props.seconds() > 0
        ? t("chat.thinking", { seconds: props.seconds() })
        : t("chat.thinkingNow");
    }
    const seconds = Math.max(1, props.seconds());
    return t("chat.thoughtFor", { seconds });
  };
  return (
    <View style={{ gap: 6 }}>
      <Press
        onPress={props.onToggle}
        scale={0.995}
        accessibilityLabel={t("chat.reasoning")}
        accessibilityState={{ selected: props.open() }}
        style={{ borderRadius: radius.control }}
        hoverStyle={{ backgroundColor: alpha(token("foreground"), 0.04) }}
      >
        <View
          style={{
            height: ROW_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            alignSelf: "flex-start",
            paddingHorizontal: 6,
            borderRadius: radius.control,
            borderCurve: "continuous",
          }}
        >
          <If
            when={props.live === "thinking"}
            else={<Icon icon={Brain} size={13} tint={token("faint")} />}
          >
            <Spinner size={12} tint={token("muted-foreground")} />
          </If>
          <Text
            style={{
              fontSize: 13,
              color: token("muted-foreground"),
              fontVariant: ["tabular-nums"],
            }}
          >
            {label()}
          </Text>
          <View
            style={{
              transform: [{ rotate: props.open() ? "0deg" : "-90deg" }],
              transitionProperty: "transform",
              transitionDuration: 180,
              transitionTimingFunction: "ease-out",
            }}
          >
            <Icon icon={ChevronDown} size={12} tint={token("faint")} />
          </View>
        </View>
      </Press>
      <If when={props.open()}>
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginLeft: 6,
            paddingLeft: 10,
            borderLeftWidth: 2,
            borderLeftColor: token("line"),
          }}
        >
          <Text
            style={{
              userSelect: "text",
              flex: 1,
              fontSize: 13,
              lineHeight: 19,
              color: token("muted-foreground"),
            }}
          >
            {props.text()}
          </Text>
        </View>
      </If>
    </View>
  );
}

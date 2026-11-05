import { platform, Text, View } from "nsh";

import { colors, Segmented } from "../../components/ui";
import { conversations, model, provider } from "./state";

const models = [
  { value: "Swift", label: "Swift" },
  { value: "Deep", label: "Deep" },
  { value: "Vision", label: "Vision" },
] as const;

const providers = [
  { value: "Claude", label: "Claude" },
  { value: "Codex", label: "Codex" },
] as const;

/** Dialogue context: model / provider and session meta (from gallery AI Chat). */
export function DialogueContext(props: { selectedId: string | null }) {
  const native = platform.idiom === "desktop" && platform.os !== "web";
  const row = () => conversations.find((c) => c.id === props.selectedId);

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 0.4 }}>
        SESSION
      </Text>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
          {row()?.label ?? "No conversation"}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {row()?.detail ?? "Select an item in the list."}
        </Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 0.4 }}>
        {native ? "PROVIDER" : "MODEL"}
      </Text>
      <If
        when={native}
        else={
          <Segmented size="small" options={models} value={model()} onChange={(v) => model.set(v)} />
        }
      >
        <Segmented
          size="small"
          options={providers}
          value={provider()}
          onChange={(v) => provider.set(v)}
        />
      </If>
      <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
        {native
          ? "Desktop uses your local Claude or Codex CLI. Sign in to the CLI in a terminal first."
          : "On this platform replies are scripted and streamed locally (gallery AI Chat scenarios)."}
      </Text>
    </View>
  );
}

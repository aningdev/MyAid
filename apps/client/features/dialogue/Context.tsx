import { platform, Text, View } from "nsh";

import { Segmented } from "../../components/ui";
import { conversations, model, provider, setModel, setProvider } from "./state";

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
    <View class="flex-1 gap-4 p-4">
      <Text class="text-sm font-semibold text-muted-foreground">Session</Text>
      <View class="gap-1">
        <Text class="text-base font-semibold text-foreground">
          {row()?.label ?? "No conversation"}
        </Text>
        <Text class="text-sm text-muted-foreground">
          {row()?.detail ?? "Select an item in the list."}
        </Text>
      </View>

      <Text class="text-sm font-semibold text-muted-foreground">
        {native ? "Provider" : "Model"}
      </Text>
      <If
        when={native}
        else={
          <Segmented size="small" options={models} value={model()} onChange={setModel} />
        }
      >
        <Segmented
          size="small"
          options={providers}
          value={provider()}
          onChange={setProvider}
        />
      </If>
      <Text class="text-xs text-muted-foreground">
        {native
          ? "Desktop uses your local Claude or Codex CLI. Sign in to the CLI in a terminal first."
          : "On this platform replies are scripted and streamed locally (gallery AI Chat scenarios)."}
      </Text>
    </View>
  );
}

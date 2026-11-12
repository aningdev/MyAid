/**
 * Bot Settings: one sheet over four tabs, the product face of a Bot's single
 * Agent preset.
 *
 * - **Profile** — name and description in the desktop registry, the template
 *   it came from, and how its preset is bound (跟随模板 / 已绑定 / 单独配置).
 * - **Runs with** — the model, its thinking level and the workspace path the
 *   Bot offers its next Dialogue. All three are registry preferences.
 * - **Skills** — the skills dsh reports for this Bot's composition
 *   (`skills.list`). Adding one means writing the preset body.
 * - **Plugins** — the plugin rows of the Bot's preset (`pluginInventory`), and
 *   whether this profile can manage them.
 *
 * Capability edits (a skill added, a plugin switched) have no dsh Remote: they
 * go through the `presets.ts` seam, which a `myaid-plugin-*` would implement,
 * and the sheet says so instead of pretending. Nothing here fakes a preset:
 * the registry records a derived preset id only when a writer returned one.
 *
 * Escape cancels (the sheet's own), Return saves, errors show inline.
 */
import { cleanup, effect, keymap, Scroll, signal, Text, View, windowSize, type Signal } from "nsh";

import { Button, colors, Field, mono, Press, Segmented, Sheet } from "../../components/ui";
import type { InventoryPreset, SkillSummary } from "../../lib/dsh/connection";
import { modelCatalog, sessionList } from "../dialogue/session/runtime";
import { botFactsSource } from "./facts";
import {
  assignDerivedPreset,
  presetBinding,
  updateBot,
  type Bot,
  type BotTemplate,
  type PresetBindingLabel,
} from "./model";
import { presetWriter, PRESET_WRITE_GAP, type CapabilityChange } from "./presets";
import { closeBotSettings, botSettingsFor } from "./settings";
import { actionError, changeRegistry, ready, registry, saving } from "./state";

type Tab = "profile" | "runs" | "skills" | "plugins";

/** The sheet's width: one column of settings, narrower than the window. */
const SHEET_WIDTH = 560;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "runs", label: "Runs with" },
  { value: "skills", label: "Skills" },
  { value: "plugins", label: "Plugins" },
];

/** The Bot Settings sheet, mounted once by the shell; the Bot id lives in `settings.ts`. */
export function BotSettings() {
  const botId = () => botSettingsFor();
  return (
    <Sheet
      open={botId() !== null}
      side="top"
      onClose={closeBotSettings}
      // A top sheet sits at the window's leading edge: inset it to the middle.
      popupStyle={{
        width: SHEET_WIDTH,
        marginLeft: Math.max(0, (windowSize().width - SHEET_WIDTH) / 2),
        gap: 12,
      }}
    >
      <If when={botId()}>{(id) => <Body botId={id()} onClose={closeBotSettings} />}</If>
    </Sheet>
  );
}

function Body(props: { botId: string; onClose: () => void }) {
  const bot = (): Bot | null => registry().bots.find((item) => item.id === props.botId) ?? null;
  const template = (): BotTemplate | null => {
    const id = bot()?.templateId;
    return registry().templates.find((item) => item.id === id) ?? null;
  };
  const binding = (): { presetId: string; label: PresetBindingLabel } | null => {
    const current = bot();
    if (!current) return null;
    try {
      return presetBinding(current, template());
    } catch {
      return null;
    }
  };

  const tab = signal<Tab>("profile");
  const name = signal(bot()?.name ?? "");
  const description = signal(bot()?.description ?? "");
  const modelKey = signal(bot()?.defaultModel ?? "");
  const thinking = signal(bot()?.defaultThinking ?? "");
  const workspace = signal(bot()?.defaultWorkspacePath ?? "");
  const savingNow = signal(false);
  const failure = signal<string | null>(null);
  /** Capability rows the person changed; saved through the preset writer. */
  const changed = signal<Readonly<Record<string, boolean>>>({});

  const skills = signal<SkillSummary[] | null>(null);
  const inventory = signal<InventoryPreset | null>(null);
  const factsNote = signal<string | null>(null);

  const models = () => modelCatalog()?.models ?? [];
  const chosenModel = () =>
    models().find((item) => `${item.provider}/${item.model}` === modelKey());
  const levels = () => chosenModel()?.thinking ?? [];
  const presetId = () => binding()?.presetId ?? "";

  /** A Session of this Bot, the newest claimed one: `skills.list` and the
   * preset composition are Session-addressable, not Bot-addressable. */
  const sampleSession = (): string | null => {
    const rows = sessionList().filter((row) =>
      registry().dialogues.some((item) => item.id === row.dialogueId && item.botId === props.botId),
    );
    return rows[0]?.id ?? null;
  };

  const load = async (): Promise<void> => {
    try {
      const facts = await botFactsSource()({
        botId: props.botId,
        presetId: presetId(),
        sessionId: sampleSession(),
      });
      skills.set(facts.skills);
      inventory.set(facts.preset);
      factsNote.set(facts.note ?? null);
    } catch (error) {
      factsNote.set(error instanceof Error ? error.message : String(error));
    }
  };

  effect(() => {
    void load();
  });

  // Return saves unless a field has the keyboard; Escape is the sheet's.
  effect(() => {
    const off = keymap.bind("return", () => void save(), { when: "notEditing" });
    cleanup(off);
  });

  const capabilityChanges = (): CapabilityChange[] =>
    Object.entries(changed()).map(([moduleName, enabled]) => ({ moduleName, enabled }));

  const save = async (): Promise<void> => {
    const current = bot();
    if (!current || savingNow()) return;
    if (!name().trim()) {
      failure.set("名称不能为空。");
      return;
    }
    savingNow.set(true);
    failure.set(null);
    try {
      const changes = capabilityChanges();
      let derivedPresetId: string | null = null;
      if (changes.length > 0) {
        const result = await presetWriter().derive({
          botId: current.id,
          botName: name().trim(),
          templateId: current.templateId,
          basePresetId: presetId(),
          changes,
        });
        if ("unavailable" in result) {
          failure.set(result.unavailable);
          return;
        }
        derivedPresetId = result.presetId;
      }
      const next = await changeRegistry((reg) => {
        const updated = updateBot(reg, current.id, {
          name: name(),
          description: description(),
          defaultModel: modelKey() || null,
          defaultThinking: thinking() || null,
          defaultWorkspacePath: workspace() || null,
        });
        return derivedPresetId
          ? assignDerivedPreset(updated, current.id, derivedPresetId)
          : updated;
      });
      if (next) {
        props.onClose();
        return;
      }
      failure.set(actionError() ?? "保存失败。");
    } finally {
      savingNow.set(false);
    }
  };

  const chooseWorkspace = async (): Promise<void> => {
    try {
      const { pickDirectory } = await import("../../lib/dsh/session");
      const path = await pickDirectory();
      if (path) workspace.set(path);
    } catch (error) {
      failure.set(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleRow = (moduleName: string, enabled: boolean) => {
    if (!presetWriter().available) return;
    changed.set({ ...changed(), [moduleName]: enabled });
  };

  return (
    <View style={{ gap: 12 }} testID="bot-settings">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.text }}>
          Bot Settings
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, numberOfLines: 1 }}>
          {bot()?.name ?? ""}
        </Text>
      </View>
      <Segmented options={TABS} value={tab()} onChange={tab.set} size="small" />
      <Scroll style={{ maxHeight: 420 }} contentStyle={{ gap: 14, paddingVertical: 4 }}>
        <If when={tab() === "profile"}>
          <ProfileTab
            name={name}
            description={description}
            template={template}
            binding={binding}
            ready={ready}
          />
        </If>
        <If when={tab() === "runs"}>
          <RunsTab
            models={() =>
              models().map((item) => ({
                key: `${item.provider}/${item.model}`,
                label: item.name || item.model,
              }))
            }
            modelKey={modelKey}
            levels={levels}
            thinking={thinking}
            workspace={workspace}
            onChooseWorkspace={() => void chooseWorkspace()}
          />
        </If>
        <If when={tab() === "skills"}>
          <SkillsTab skills={skills} note={factsNote} />
        </If>
        <If when={tab() === "plugins"}>
          <PluginsTab
            presetId={presetId}
            preset={inventory}
            changed={changed}
            note={factsNote}
            writable={() => presetWriter().available}
            onToggle={toggleRow}
          />
        </If>
      </Scroll>
      <If when={!!failure()}>
        <Text style={{ fontSize: 12, lineHeight: 17, color: colors.danger }}>{failure()}</Text>
      </If>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button label="取消" variant="secondary" size="small" onPress={props.onClose} />
        <Button
          label="保存"
          variant="accent"
          size="small"
          disabled={saving() || savingNow()}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}

function ProfileTab(props: {
  name: Signal<string>;
  description: Signal<string>;
  template: () => BotTemplate | null;
  binding: () => { presetId: string; label: PresetBindingLabel } | null;
  ready: () => boolean;
}) {
  const label = () => props.binding()?.label ?? "";
  const tone = () =>
    label() === "已绑定" ? colors.accent : label() === "单独配置" ? colors.info : colors.muted;
  return (
    <View style={{ gap: 12 }}>
      <If when={props.ready()} else={<Hint text="正在读取注册表…" />}>
        <Field
          label="名称"
          testID="bot-settings-name"
          value={props.name()}
          placeholder="Ada"
          onChange={props.name.set}
        />
        <Field
          label="说明"
          testID="bot-settings-description"
          value={props.description()}
          placeholder="一句话说清它帮你做什么"
          onChange={props.description.set}
        />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
            模板与 preset
          </Text>
          <Text style={{ fontSize: 14, color: colors.text }}>
            {props.template()?.name ?? "模板不在了"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ fontSize: 12, color: colors.text, fontFamily: mono, userSelect: "text" }}
            >
              {props.binding()?.presetId ?? "—"}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: tone() }}>{label()}</Text>
          </View>
        </View>
      </If>
    </View>
  );
}

function RunsTab(props: {
  models: () => { key: string; label: string }[];
  modelKey: Signal<string>;
  levels: () => { id: string; name: string }[];
  thinking: Signal<string>;
  workspace: Signal<string>;
  onChooseWorkspace: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>模型</Text>
        <If
          when={props.models().length > 0}
          else={<Hint text="后台没有报告模型目录；连上之后从 dsh 的目录里选。" />}
        >
          <View style={{ gap: 1 }}>
            <Each of={props.models()}>
              {(item) => (
                <Choice
                  label={item().label}
                  detail={item().key}
                  selected={props.modelKey() === item().key}
                  onPress={() => {
                    props.modelKey.set(item().key);
                    props.thinking.set("");
                  }}
                />
              )}
            </Each>
          </View>
        </If>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>思考</Text>
        <If when={props.levels().length > 0} else={<Hint text="这个模型没有报告思考档位。" />}>
          <Segmented
            size="small"
            options={[
              { value: "", label: "默认" },
              ...props.levels().map((item) => ({ value: item.id, label: item.name })),
            ]}
            value={props.thinking()}
            onChange={props.thinking.set}
          />
        </If>
      </View>
      <Field
        label="默认工作区"
        testID="bot-settings-workspace"
        value={props.workspace()}
        placeholder="/path/to/project"
        onChange={props.workspace.set}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="选择目录…" size="small" onPress={props.onChooseWorkspace} />
      </View>
      <Hint text="新建 Dialogue 时作为默认工作区；已有的 Dialogue 保留自己的路径。" />
    </View>
  );
}

function SkillsTab(props: { skills: Signal<SkillSummary[] | null>; note: Signal<string | null> }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title="技能" />
      <If when={props.skills() === null} else={null}>
        <Hint text="正在读取…" />
      </If>
      <If
        when={(props.skills() ?? []).length > 0}
        else={
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 10 }}>
            <Hint text="这个 Bot 的组合里还没有用户可调用的技能。" />
            <Button
              label="+ 添加"
              size="small"
              variant="secondary"
              disabled
              onPress={() => undefined}
            />
          </View>
        }
      >
        <View style={{ gap: 1 }}>
          <Each of={props.skills() ?? []}>
            {(skill) => <Row label={`/${skill().name}`} detail={skill().description || "—"} />}
          </Each>
        </View>
      </If>
      <If when={!!props.note()}>
        <Hint text={props.note() ?? ""} />
      </If>
      <Hint text={PRESET_WRITE_GAP} />
    </View>
  );
}

function PluginsTab(props: {
  presetId: () => string;
  preset: Signal<InventoryPreset | null>;
  changed: Signal<Readonly<Record<string, boolean>>>;
  note: Signal<string | null>;
  writable: () => boolean;
  onToggle: (moduleName: string, enabled: boolean) => void;
}) {
  const enabledOf = (row: { moduleName: string; enabled: boolean | "conditional" }) => {
    const changed = props.changed()[row.moduleName];
    return changed === undefined ? row.enabled === true : changed;
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
        {`${props.presetId() || "preset"} 的组合`}
      </Text>
      <If
        when={(props.preset()?.rows ?? []).length > 0}
        else={<Hint text="后台没有报告这个 preset 的组合（可能未挂载或已损坏）。" />}
      >
        <View style={{ gap: 1 }}>
          <Each of={props.preset()?.rows ?? []}>
            {(row) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.text, numberOfLines: 1 }}>
                    {row().name ?? row().moduleName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.muted,
                      fontFamily: mono,
                      numberOfLines: 1,
                    }}
                  >
                    {row().moduleName}
                  </Text>
                </View>
                <Press
                  onPress={() => props.onToggle(row().moduleName, !enabledOf(row()))}
                  accessibilityLabel={`切换 ${row().name ?? row().moduleName}`}
                  accessibilityState={{ checked: enabledOf(row()), disabled: !props.writable() }}
                  disabled={!props.writable()}
                  scale={0.96}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: enabledOf(row()) ? colors.accent : colors.muted,
                    }}
                  >
                    {enabledOf(row()) ? "已启用" : "已停用"}
                  </Text>
                </Press>
              </View>
            )}
          </Each>
        </View>
      </If>
      <If when={!!props.preset()?.broken}>
        <Hint text={props.preset()?.broken ?? ""} />
      </If>
      <If when={!!props.note()}>
        <Hint text={props.note() ?? ""} />
      </If>
      <If when={!props.writable()}>
        <Hint text={PRESET_WRITE_GAP} />
      </If>
    </View>
  );
}

function Choice(props: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.selected }}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: props.selected ? colors.raised : "transparent",
        gap: 1,
      }}
    >
      <Text
        style={{ fontSize: 12, fontWeight: props.selected ? "600" : "400", color: colors.text }}
      >
        {props.label}
      </Text>
      <Text style={{ fontSize: 11, color: colors.muted, fontFamily: mono, numberOfLines: 1 }}>
        {props.detail}
      </Text>
    </View>
  );
}

function Row(props: { label: string; detail: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 1,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.text, fontFamily: mono }}>{props.label}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, numberOfLines: 2 }}>{props.detail}</Text>
    </View>
  );
}

function SectionTitle(props: { title: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{props.title}</Text>
  );
}

function Hint(props: { text: string }) {
  return <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>{props.text}</Text>;
}

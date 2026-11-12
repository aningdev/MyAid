/**
 * A Bot's Panel content: its editor (name, template, runtime preset, default
 * model, initialize, delete) and the Dialogues it has, each opening in the
 * same Panel. The draft (`botId` null) creates the next Bot; saving points
 * the Panel at the saved one, so the address stays the truth.
 */
import { effect, Scroll, signal, Text, View } from "nsh";

import { botAddress, dialogueAddress } from "../../components/shell/navAddresses";
import { setPanelAddress } from "../../components/shell/state";
import {
  Badge,
  Button,
  colors,
  Field,
  hovered,
  mono,
  radius,
  type Tone,
} from "../../components/ui";
import { defaultIdentity } from "./identity";
import {
  createBot,
  createDialogue,
  createTemplate,
  deleteBot,
  initializeBot,
  updateBot,
  presetBinding,
  type Bot,
  type BotTemplate,
  type PresetBindingLabel,
} from "./model";
import { openNewBot } from "./newBot";
import { openBotSettings } from "./settings";
import {
  actionError,
  changeRegistry,
  clearActionError,
  importDshTemplates,
  loadError,
  persistenceNotice,
  ready,
  registry,
  saving,
  setActionError,
  writeBlocked,
} from "./state";

export function BotPanel(props: { panelId: string; botId: string | null }) {
  const stored = () => {
    const id = props.botId;
    return id ? (registry().bots.find((bot) => bot.id === id) ?? null) : null;
  };
  const missing = () => !!props.botId && ready() && !stored();

  const deleted = signal(false);
  const name = signal("");
  const templateId = signal("");
  const model = signal("");
  const workspace = signal("");
  const templateName = signal("");
  const templatePreset = signal("");

  // The form follows the stored Bot (or a draft) whenever the Panel is
  // pointed at another one or the registry reloads it.
  let synced = "";
  effect(() => {
    const bot = stored();
    const key = bot
      ? `${bot.id}|${bot.name}|${bot.templateId}|${bot.defaultModel ?? ""}`
      : (props.botId ?? "new");
    if (synced === key) return;
    synced = key;
    name.set(bot?.name ?? "");
    templateId.set(bot?.templateId ?? "");
    model.set(bot?.defaultModel ?? "");
    workspace.set(bot?.defaultWorkspacePath ?? "");
  });

  const templates = () => registry().templates;
  const chosenTemplateId = () => {
    const id = templateId();
    if (id && templates().some((item) => item.id === id)) return id;
    return templates()[0]?.id ?? "";
  };
  const template = () => templates().find((item) => item.id === chosenTemplateId()) ?? null;
  const readyBot = () => stored()?.status === "ready";
  const dialogues = () =>
    registry().dialogues.filter((item) => item.botId === props.botId && !item.archived);

  /** The Bot as the form would save it (a draft included), for the preset line. */
  const draftBot = (): Bot => {
    const bot = stored();
    return {
      id: props.botId ?? "new",
      name: name(),
      description: bot?.description ?? null,
      templateId: chosenTemplateId(),
      defaultModel: model().trim() ? model() : null,
      defaultThinking: bot?.defaultThinking ?? null,
      defaultWorkspacePath: bot?.defaultWorkspacePath ?? null,
      hadDialogue: bot?.hadDialogue ?? false,
      status: bot?.status ?? "draft",
      boundPresetId: bot?.boundPresetId ?? null,
      derivedPresetId: bot?.derivedPresetId ?? null,
      identity: bot?.identity ?? defaultIdentity(props.botId ?? "new"),
    };
  };
  const binding = (): { presetId: string; label: PresetBindingLabel } | null => {
    try {
      return presetBinding(draftBot(), template());
    } catch {
      return null;
    }
  };

  const canSave = () => !writeBlocked() && !!name().trim() && !!chosenTemplateId();

  /** Create or update the Bot; returns its id (a new Bot moves the Panel to it). */
  const save = async (): Promise<string | null> => {
    if (!canSave()) return null;
    const input = {
      name: name(),
      templateId: chosenTemplateId(),
      defaultModel: model().trim() ? model() : null,
    };
    const id = props.botId;
    const next = await changeRegistry((reg) =>
      id ? updateBot(reg, id, input) : createBot(reg, input),
    );
    if (!next) return null;
    if (id) return id;
    const created = next.bots[next.bots.length - 1];
    if (!created) return null;
    setPanelAddress(props.panelId, botAddress(created));
    return created.id;
  };

  const initialize = async (): Promise<void> => {
    const id = await save();
    if (!id) return;
    await changeRegistry((reg) => initializeBot(reg, id));
  };

  const remove = async (): Promise<void> => {
    const id = props.botId;
    if (!id) return;
    const next = await changeRegistry((reg) => deleteBot(reg, id));
    if (next) deleted.set(true);
  };

  const addDialogue = async (): Promise<void> => {
    const bot = stored();
    const path = workspace().trim();
    if (!bot || !path) return;
    const next = await changeRegistry((reg) =>
      createDialogue(reg, { botId: bot.id, workspacePath: path }),
    );
    if (!next) return;
    const created = next.dialogues.filter((item) => item.botId === bot.id).at(-1);
    if (!created) return;
    workspace.set("");
    setPanelAddress(
      props.panelId,
      dialogueAddress({
        id: created.id,
        workspacePath: created.workspacePath,
        botId: bot.id,
        botName: bot.name,
      }),
    );
  };

  const addTemplate = async (): Promise<void> => {
    const title = templateName().trim();
    const presetId = templatePreset().trim();
    if (!title || !presetId) return;
    const next = await changeRegistry((reg) => createTemplate(reg, { name: title, presetId }));
    if (!next) return;
    templateId.set(next.templates[next.templates.length - 1]?.id ?? "");
    templateName.set("");
    templatePreset.set("");
  };

  const chooseWorkspace = async (): Promise<void> => {
    try {
      const { pickDirectory } = await import("../../lib/dsh/session");
      const path = await pickDirectory();
      if (path) workspace.set(path);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 16 }}>
      <If when={ready()} else={<StatusText label="正在读取注册表" />}>
        <View style={{ gap: 16, maxWidth: 560 }}>
          <If when={loadError()}>
            <Text style={{ fontSize: 13, lineHeight: 18, color: colors.danger }}>
              {loadError()}
            </Text>
          </If>
          <If when={persistenceNotice()}>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
              {persistenceNotice()}
            </Text>
          </If>
          <If when={deleted()}>
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
                这个 Bot 已删除。
              </Text>
              <Button label="新建 Bot" variant="accent" size="small" onPress={openNewBot} />
            </View>
          </If>
          <If when={!deleted() && missing()}>
            <Missing />
          </If>
          <If when={!deleted() && !missing()}>
            <Editor />
          </If>
        </View>
      </If>
    </Scroll>
  );

  function Missing() {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
          这个 Bot 不在注册表里（可能已被删除）。
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
          从 Navigator 的 Bots 分区里选一个，或按 ⌘N 新建。
        </Text>
      </View>
    );
  }

  function Editor() {
    return (
      <View style={{ gap: 16 }}>
        <If when={actionError()}>
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.danger }}>
            {actionError()}
          </Text>
        </If>
        <Field
          label="名称"
          testID="bot-name"
          value={name()}
          placeholder="Ada"
          onChange={(value) => {
            clearActionError();
            name.set(value);
          }}
        />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>模板</Text>
          <If
            when={readyBot()}
            else={
              <If
                when={templates().length > 0}
                else={
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
                      还没有模板。从一个 Agent preset 建一个，或从 dsh 导入。
                    </Text>
                    <Field
                      label="模板名称"
                      testID="template-name"
                      value={templateName()}
                      placeholder="Coding"
                      onChange={(value) => templateName.set(value)}
                    />
                    <Field
                      label="Agent preset"
                      testID="template-preset"
                      value={templatePreset()}
                      placeholder="standard"
                      onChange={(value) => templatePreset.set(value)}
                    />
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        label="新建模板"
                        size="small"
                        disabled={
                          writeBlocked() || !templateName().trim() || !templatePreset().trim()
                        }
                        onPress={() => void addTemplate()}
                      />
                      <Button
                        label="从 dsh 导入"
                        variant="accent"
                        size="small"
                        disabled={writeBlocked()}
                        onPress={() => void importDshTemplates()}
                      />
                    </View>
                  </View>
                }
              >
                <View style={{ gap: 4 }}>
                  <Each of={templates()}>
                    {(item) => (
                      <TemplateChoice
                        template={item()}
                        selected={chosenTemplateId() === item().id}
                        onPress={() => templateId.set(item().id)}
                      />
                    )}
                  </Each>
                </View>
              </If>
            }
          >
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text, paddingVertical: 8 }}>
              {template()?.name ?? "模板不在了"}
            </Text>
          </If>
        </View>
        <Field
          label="默认模型"
          testID="bot-model"
          value={model()}
          placeholder="可选"
          onChange={setModel}
        />
        <PresetLine binding={binding()} />
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label="保存"
            size="small"
            disabled={saving() || !canSave()}
            onPress={() => void save()}
          />
          <If when={!readyBot()}>
            <Button
              label="初始化"
              variant="accent"
              size="small"
              disabled={saving() || !canSave()}
              onPress={() => void initialize()}
            />
          </If>
          <If when={!!props.botId && !stored()?.hadDialogue}>
            <Button
              label="删除"
              variant="secondary"
              size="small"
              disabled={writeBlocked()}
              onPress={() => void remove()}
            />
          </If>
          <If when={!!props.botId}>
            <Button
              label="Bot Settings…"
              variant="secondary"
              size="small"
              onPress={() => openBotSettings(props.botId!)}
            />
          </If>
        </View>
        <If when={readyBot() && !!props.botId}>
          <DialogueSection />
        </If>
      </View>
    );
  }

  function DialogueSection() {
    return (
      <>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>Dialogue</Text>
          <Field
            label="工作区"
            testID="dialogue-workspace"
            value={workspace()}
            placeholder="/path/to/workspace"
            onChange={setWorkspace}
          />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button label="选择目录…" size="small" onPress={() => void chooseWorkspace()} />
            <Button
              label="新建 Dialogue"
              variant="accent"
              size="small"
              disabled={saving() || !workspace().trim()}
              onPress={() => void addDialogue()}
            />
          </View>
          <If
            when={dialogues().length > 0}
            else={
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
                还没有 Dialogue。工作时用一个项目目录开一段。
              </Text>
            }
          >
            <View style={{ gap: 2 }}>
              <Each of={dialogues()}>
                {(dialogue) => (
                  <EntryRow
                    title={dialogue().workspacePath}
                    detail={`${dialogue().claims.length} 个 Session`}
                    onPress={() => {
                      const bot = stored();
                      if (!bot) return;
                      setPanelAddress(
                        props.panelId,
                        dialogueAddress({
                          id: dialogue().id,
                          workspacePath: dialogue().workspacePath,
                          botId: bot.id,
                          botName: bot.name,
                        }),
                      );
                    }}
                  />
                )}
              </Each>
            </View>
          </If>
        </View>
      </>
    );
  }

  function setModel(value: string) {
    clearActionError();
    model.set(value);
  }

  function setWorkspace(value: string) {
    clearActionError();
    workspace.set(value);
  }
}

function TemplateChoice(props: { template: BotTemplate; selected: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={`选择模板 ${props.template.name}`}
      accessibilityState={{ selected: props.selected }}
      hoverStyle={props.selected ? undefined : hovered()}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: props.selected ? colors.accent : colors.border,
        backgroundColor: props.selected ? colors.raised : "transparent",
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
        {props.template.name}
      </Text>
      <Text style={{ fontSize: 12, color: colors.muted, fontFamily: mono }}>
        {props.template.presetId}
      </Text>
    </View>
  );
}

function PresetLine(props: { binding: { presetId: string; label: PresetBindingLabel } | null }) {
  const tone = (): Tone =>
    props.binding?.label === "已绑定"
      ? "accent"
      : props.binding?.label === "单独配置"
        ? "info"
        : "neutral";
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>运行时 preset</Text>
      <If
        when={props.binding !== null}
        else={<Text style={{ fontSize: 14, color: colors.danger }}>模板不在了</Text>}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 14, color: colors.text, fontFamily: mono }}>
            {props.binding?.presetId}
          </Text>
          <Badge label={props.binding?.label ?? ""} tone={tone()} />
        </View>
      </If>
    </View>
  );
}

function EntryRow(props: {
  title: string;
  detail: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.title}
      accessibilityState={{ selected: !!props.selected }}
      hoverStyle={props.selected ? undefined : hovered()}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: radius.control,
        gap: 2,
        backgroundColor: props.selected ? colors.raised : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: props.selected ? "600" : "400",
          color: colors.text,
        }}
      >
        {props.title}
      </Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{props.detail}</Text>
    </View>
  );
}

function StatusText(props: { label: string }) {
  return (
    <View style={{ flex: 1, padding: 4 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{props.label}</Text>
    </View>
  );
}

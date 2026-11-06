/**
 * Bots module: templates map to DSH Agent preset ids, and each Bot is an instance.
 * Shell only mounts this Page.
 */
import { cleanup, effect, Scroll, Text, untracked, View } from "nsh";
import { NavPage, NavStack } from "nsh/base";

import { Badge, Button, colors, Field, hovered, mono, radius } from "../../components/ui";
import { WorkspacePageHeader } from "../../components/workspace/PageHeader";
import { isDesktopLayout } from "../../workspace/layout";
import { setModuleAtRoot } from "../../workspace/state";
import { openBotSessions } from "../dialogue/navigate";
import {
  answerApproval,
  approvalOwnerBotId,
  occupyingSessionId,
  pendingApproval,
  sessionError,
} from "../dialogue/session/runtime";
import { presetBinding, type Bot, type BotTemplate, type PresetBindingLabel } from "./model";
import {
  actionError,
  beginBot,
  beginTemplate,
  botsNav,
  closeDetail,
  deleteEditorBot,
  editBot,
  editTemplate,
  editor,
  importDshTemplates,
  initializeEditor,
  loadError,
  loadRegistry,
  onDetailDismiss,
  persistenceNotice,
  ready,
  registry,
  removeTemplate,
  resetBotsNavigation,
  saveEditor,
  saving,
  setEditorModel,
  setEditorName,
  setEditorPreset,
  setEditorTemplate,
  setEditorWorkspace,
  type BotsRoute,
  type Editor,
} from "./state";

const LIST_WIDTH = 300;

export function BotsPage() {
  effect(() => {
    void loadRegistry();
  });
  effect(() => {
    const top = botsNav.routes().at(-1);
    setModuleAtRoot(!top || top.name === "list");
  });
  cleanup(() => {
    resetBotsNavigation();
  });

  return (
    <If when={isDesktopLayout()} else={<MobileBots />}>
      <DesktopBots />
    </If>
  );
}

function DesktopBots() {
  return (
    <View
      style={{ flex: 1, flexDirection: "row", minHeight: 0, backgroundColor: colors.background }}
    >
      <View
        style={{
          width: LIST_WIDTH,
          flexShrink: 0,
          borderRightWidth: 1,
          borderRightColor: colors.line,
        }}
      >
        <BotsList />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <BotsDetail />
      </View>
    </View>
  );
}

function MobileBots() {
  return (
    <NavStack state={botsNav} style={{ flex: 1 }}>
      {(route: BotsRoute) => {
        if (route.name === "list") {
          return (
            <NavPage title="Bots" header={<WorkspacePageHeader title="Bots" root />}>
              <BotsList />
            </NavPage>
          );
        }
        return (
          <NavPage
            title={editorTitle()}
            onDismiss={() => onDetailDismiss()}
            header={<WorkspacePageHeader title={editorTitle()} onBack={() => closeDetail()} />}
          >
            <BotsDetail />
          </NavPage>
        );
      }}
    </NavStack>
  );
}

function BotsList() {
  return (
    <If when={ready()} else={<StatusText label="正在读取注册表" />}>
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 12, gap: 16 }}>
        <View style={{ gap: 16 }}>
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
          <SectionLabel label="模板" />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button
              label="从 dsh 导入"
              variant="accent"
              size="small"
              disabled={writeBlocked()}
              onPress={() => void importDshTemplates()}
            />
            <Button
              label="新建模板"
              variant="secondary"
              size="small"
              disabled={writeBlocked()}
              onPress={() => beginTemplate()}
            />
          </View>
          <If
            when={registry().templates.length === 0}
            else={
              <View style={{ gap: 2 }}>
                <Each of={registry().templates}>
                  {(template) => (
                    <EntryRow
                      title={template().name}
                      detail={template().presetId}
                      selected={selectedTemplate(template().id)}
                      onPress={() => editTemplate(template().id)}
                    />
                  )}
                </Each>
              </View>
            }
          >
            <Text style={{ fontSize: 13, lineHeight: 18, color: colors.muted }}>
              还没有模板。先从 dsh 导入内置 Agent preset，或手动填写 preset id。
            </Text>
          </If>
          <SectionLabel label="Bot" />
          <Button
            label="新建 Bot"
            variant="secondary"
            size="small"
            disabled={writeBlocked() || registry().templates.length === 0}
            onPress={() => beginBot()}
          />
          <If
            when={registry().bots.length === 0}
            else={
              <View style={{ gap: 2 }}>
                <Each of={registry().bots}>
                  {(bot) => (
                    <EntryRow
                      title={bot().name}
                      detail={botDetail(bot())}
                      selected={selectedBot(bot().id)}
                      onPress={() => {
                        if (approvalOwnerBotId() && approvalOwnerBotId() !== bot().id) return;
                        editBot(bot().id);
                      }}
                    />
                  )}
                </Each>
              </View>
            }
          >
            <Text style={{ fontSize: 13, lineHeight: 18, color: colors.muted }}>
              还没有 Bot。从一个模板创建实例。
            </Text>
          </If>
        </View>
      </Scroll>
    </If>
  );
}

function BotsDetail() {
  const current = () => editor();
  return (
    <If when={ready()} else={<StatusText label="正在读取注册表" />}>
      <If
        when={current().kind !== "none"}
        else={<StatusText label="选择一个模板或 Bot，或新建一个。" />}
      >
        <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 16, maxWidth: 560 }}>
            <If when={actionError() || sessionError()}>
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.danger }}>
                {actionError() || sessionError()}
              </Text>
            </If>
            <If when={current().kind === "template"} else={<BotForm />}>
              <TemplateForm />
            </If>
          </View>
        </Scroll>
      </If>
    </If>
  );
}

function TemplateForm() {
  const form = templateEditor;
  return (
    <If when={form() !== null}>
      <View style={{ gap: 16 }}>
        <Field
          label="名称"
          testID="template-name"
          value={form()?.name ?? ""}
          placeholder="Coding"
          onChange={setEditorName}
        />
        <Field
          label="Agent preset"
          testID="template-preset"
          value={form()?.presetId ?? ""}
          placeholder="standard"
          onChange={setEditorPreset}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="保存"
            size="small"
            disabled={templateSaveDisabled()}
            onPress={() => void saveEditor()}
          />
          <If when={form()?.id !== "new"}>
            <Button
              label="删除"
              variant="secondary"
              size="small"
              disabled={writeBlocked()}
              onPress={() => void removeTemplate()}
            />
          </If>
        </View>
      </View>
    </If>
  );
}

function BotForm() {
  const form = botEditor;
  const stored = () => registry().bots.find((bot) => bot.id === form()?.id);
  const readyBot = () => stored()?.status === "ready";
  const template = () =>
    registry().templates.find((item) => item.id === form()?.templateId) ?? null;
  const binding = () => {
    const draft = form();
    if (!draft) return null;
    const bot = previewBot(draft, stored());
    try {
      return presetBinding(bot, template());
    } catch {
      return null;
    }
  };
  return (
    <If when={form() !== null}>
      <View style={{ gap: 16 }}>
        <Field
          label="名称"
          testID="bot-name"
          value={form()?.name ?? ""}
          placeholder="Ada"
          onChange={setEditorName}
        />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>模板</Text>
          <If
            when={readyBot()}
            else={
              <View style={{ gap: 4 }}>
                <Each of={registry().templates}>
                  {(item) => (
                    <TemplateChoice template={item()} selected={form()?.templateId === item().id} />
                  )}
                </Each>
              </View>
            }
          >
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text, paddingVertical: 8 }}>
              {template()?.name ?? "模板不在了"}
            </Text>
          </If>
        </View>
        <View style={{ gap: 6 }}>
          <Field
            label="工作区"
            testID={readyBot() ? undefined : "bot-workspace"}
            value={form()?.workspace ?? ""}
            placeholder="/path/to/workspace"
            editable={!readyBot()}
            onChange={readyBot() ? undefined : setEditorWorkspace}
          />
          <If when={!readyBot()}>
            <Button label="选择目录…" size="small" onPress={() => void pickBotWorkspace()} />
          </If>
        </View>
        <Field
          label="默认模型"
          testID="bot-model"
          value={form()?.defaultModel ?? ""}
          placeholder="可选"
          onChange={setEditorModel}
        />
        <PresetLine binding={binding()} />
        <If when={pendingApproval() && approvalOwnerBotId() === form()?.id}>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
              需要审批：{pendingApproval()?.toolName}
            </Text>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
              {pendingApproval()?.reason}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label="允许一次"
                size="small"
                onPress={() => answerApproval("allowed-once")}
              />
              <Button
                label="拒绝"
                variant="secondary"
                size="small"
                onPress={() => answerApproval("rejected")}
              />
            </View>
          </View>
        </If>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label="保存"
            size="small"
            disabled={botSaveDisabled()}
            onPress={() => void saveEditor()}
          />
          <If when={!readyBot()}>
            <Button
              label="初始化"
              variant="accent"
              size="small"
              disabled={initializeDisabled()}
              onPress={() => void initializeEditor()}
            />
          </If>
          <If when={readyBot() && form()?.id !== "new"}>
            <Button
              label="会话"
              variant="secondary"
              size="small"
              onPress={() => {
                const id = form()?.id;
                if (id) openBotSessions(id);
              }}
            />
          </If>
          <If when={stored() && !stored()?.hadSession}>
            <Button
              label="删除"
              variant="secondary"
              size="small"
              disabled={writeBlocked()}
              onPress={() => void deleteEditorBot()}
            />
          </If>
        </View>
      </View>
    </If>
  );
}

function TemplateChoice(props: { template: BotTemplate; selected: boolean }) {
  return (
    <View
      onPress={() => setEditorTemplate(props.template.id)}
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
  const tone = () =>
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
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.title}
      accessibilityState={{ selected: props.selected }}
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

function SectionLabel(props: { label: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "600",
        color: colors.faint,
        letterSpacing: 0.6,
      }}
    >
      {props.label}
    </Text>
  );
}

function StatusText(props: { label: string }) {
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{props.label}</Text>
    </View>
  );
}

function templateEditor(): Extract<Editor, { kind: "template" }> | null {
  const current = editor();
  return current.kind === "template" ? current : null;
}

function botEditor(): Extract<Editor, { kind: "bot" }> | null {
  const current = editor();
  return current.kind === "bot" ? current : null;
}

function editorTitle(): string {
  const current = editor();
  if (current.kind === "template")
    return current.id === "new" ? "新建模板" : current.name || "模板";
  if (current.kind === "bot") return current.id === "new" ? "新建 Bot" : current.name || "Bot";
  return "Bots";
}

function selectedTemplate(id: string): boolean {
  const current = editor();
  return current.kind === "template" && current.id === id;
}

function selectedBot(id: string): boolean {
  const current = editor();
  return current.kind === "bot" && current.id === id;
}

function botDetail(bot: Bot): string {
  const template = registry().templates.find((item) => item.id === bot.templateId) ?? null;
  const running =
    occupyingSessionId() !== null &&
    bot.claims.some((claim) => claim.sessionId === occupyingSessionId());
  try {
    const binding = presetBinding(bot, template);
    const base = `${binding.presetId} · ${binding.label}`;
    return running ? `${base} · 执行中` : base;
  } catch {
    return "模板不在了";
  }
}

function previewBot(form: Extract<Editor, { kind: "bot" }>, stored: Bot | undefined): Bot {
  return {
    id: form.id,
    name: form.name,
    templateId: form.templateId,
    workspace: form.workspace,
    defaultModel: form.defaultModel.trim() ? form.defaultModel : null,
    claims: stored?.claims ?? [],
    hadSession: stored?.hadSession ?? false,
    status: stored?.status ?? "draft",
    boundPresetId: stored?.boundPresetId ?? null,
    derivedPresetId: stored?.derivedPresetId ?? null,
  };
}

function writeBlocked(): boolean {
  return !ready() || loadError() !== null || saving();
}

function templateSaveDisabled(): boolean {
  const current = editor();
  if (current.kind !== "template") return true;
  return writeBlocked() || !current.name.trim() || !current.presetId.trim();
}

function botSaveDisabled(): boolean {
  const current = editor();
  if (current.kind !== "bot") return true;
  return writeBlocked() || !current.name.trim() || !current.templateId;
}

function initializeDisabled(): boolean {
  const current = editor();
  if (current.kind !== "bot") return true;
  return botSaveDisabled() || !current.workspace.trim();
}

/** Phase B: official `directoryPicker.pick` → store absolute path on the Bot draft. */
async function pickBotWorkspace(): Promise<void> {
  const current = botEditor();
  if (!current || writeBlocked()) return;
  const stored = untracked(registry).bots.find((bot) => bot.id === current.id);
  if (stored?.status === "ready") return;
  try {
    const { pickDirectory } = await import("../../lib/dsh/session");
    const path = await pickDirectory();
    if (path) setEditorWorkspace(path);
  } catch (error) {
    actionError.set(error instanceof Error ? error.message : String(error));
  }
}

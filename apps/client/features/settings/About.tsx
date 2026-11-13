/**
 * Settings › About: the three versions a support question starts with, the
 * connection state, and one button that copies them as text. The values are
 * read from the Host's public status and this build's own version; nothing
 * here reads a key, a token or a Session.
 */
import { Clipboard, effect, Scroll, signal, Text, untracked, View, type JSX } from "nsh";

import { Button, colors, finish, mono, radius } from "../../components/ui";
import { t } from "../../lib/i18n";
import { hostFacts, lifecycleLabel, loadHostFacts } from "./hostFacts";
import { diagnosticsText, versionRows } from "./versions";

export function AboutSection() {
  effect(() => {
    untracked(() => {
      void loadHostFacts();
    });
  });
  const copied = signal(false);
  const facts = hostFacts;
  const rows = () => versionRows(facts());

  const copy = (): void => {
    void Clipboard.writeText(diagnosticsText(facts()));
    copied.set(true);
    setTimeout(() => copied.set(false), 1600);
  };

  return (
    <Scroll
      testID="settings-about"
      style={{ flex: 1 }}
      contentStyle={{ padding: 20, gap: 16, maxWidth: 720 }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: colors.text }}>
          {t("settings.about.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          {t("settings.about.note")}
        </Text>
      </View>

      <Card title={t("settings.about.versions")}>
        <VersionRow label="MyAid" value={rows().myaid} testID="settings-about-myaid" />
        <VersionRow label="Host" value={rows().host} testID="settings-about-host" />
        <VersionRow
          label="dsh"
          value={rows().dsh}
          note={
            facts().actualDsh
              ? undefined
              : t("settings.about.support", { version: rows().supportedDsh })
          }
          testID="settings-about-dsh"
        />
      </Card>

      <Card title={t("settings.about.connection")}>
        <VersionRow
          label="Host"
          value={facts().reachable ? t("background.connected") : t("background.disconnected")}
          testID="settings-about-host-state"
        />
        <VersionRow
          label="dsh web"
          value={lifecycleLabel(rows().hostPhase)}
          testID="settings-about-dsh-state"
        />
        <If when={facts().mismatch}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
            {facts().mismatch}
          </Text>
        </If>
      </Card>

      <Card title={t("settings.about.diagnostics")}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
          {t("settings.about.diagnosticsNote")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Button
            label={copied() ? t("common.copied") : t("settings.about.copy")}
            variant="accent"
            size="small"
            onPress={copy}
          />
          <Text testID="settings-about-copied" style={{ fontSize: 12, color: colors.faint }}>
            {copied() ? t("settings.about.copied") : t("settings.about.noSecrets")}
          </Text>
        </View>
      </Card>
    </Scroll>
  );
}

function VersionRow(props: { label: string; value: string; note?: string; testID: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, minHeight: 26 }}>
      <Text style={{ width: 90, fontSize: 12, color: colors.muted }}>{props.label}</Text>
      <Text
        testID={props.testID}
        style={{ flex: 1, fontSize: 13, color: colors.text, fontFamily: mono, userSelect: "text" }}
      >
        {props.value}
      </Text>
      <If when={props.note}>
        <Text style={{ fontSize: 11, color: colors.faint }}>{props.note}</Text>
      </If>
    </View>
  );
}

function Card(props: { title: string; children: JSX.Element }) {
  return (
    <View
      style={{
        gap: 10,
        padding: 14,
        borderRadius: radius.card,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        ...finish.card,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{props.title}</Text>
      {props.children}
    </View>
  );
}

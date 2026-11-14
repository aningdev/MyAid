/**
 * Settings › About: the three versions a support question starts with, the
 * connection state, and one button that copies them as text. The values are
 * read from the Host's public status and this build's own version; nothing
 * here reads a key, a token or a Session.
 */
import { Clipboard, effect, Scroll, signal, Text, untracked, View, type JSX, token } from "nsh";

import { Button } from "../../components/ui/button";
import { Card as CardFrame, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { t } from "../../lib/i18n";
import { finish, mono, radius } from "../../lib/theme";
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
        <Text style={{ fontSize: 20, fontWeight: "600", color: token("foreground") }}>
          {t("settings.about.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
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
          <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
            {facts().mismatch}
          </Text>
        </If>
      </Card>

      <Card title={t("settings.about.diagnostics")}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: token("muted-foreground") }}>
          {t("settings.about.diagnosticsNote")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Button
            size="sm"
            onPress={copy}
            accessibilityLabel={copied() ? t("common.copied") : t("settings.about.copy")}
          >
            {copied() ? t("common.copied") : t("settings.about.copy")}
          </Button>
          <Text testID="settings-about-copied" style={{ fontSize: 12, color: token("faint") }}>
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
      <Text style={{ width: 90, fontSize: 12, color: token("muted-foreground") }}>
        {props.label}
      </Text>
      <Text
        testID={props.testID}
        style={{
          flex: 1,
          fontSize: 13,
          color: token("foreground"),
          fontFamily: mono,
          userSelect: "text",
        }}
      >
        {props.value}
      </Text>
      <If when={props.note}>
        <Text style={{ fontSize: 11, color: token("faint") }}>{props.note}</Text>
      </If>
    </View>
  );
}

function Card(props: { title: string; children: JSX.Element }) {
  return (
    <CardFrame>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </CardFrame>
  );
}

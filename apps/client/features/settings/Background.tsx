/**
 * Settings › Background: the Host and dsh web's live status (from the Host's
 * public control API) beside the Host's OS registration (0006, 0007). The page
 * only orchestrates the verbs; the Host's lifecycle owns start / stop / restart,
 * and Host registration owns enable / stop.
 */
import { effect, Scroll, Text, untracked, View, type JSX, token } from "nsh";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card as CardFrame, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  enableBackgroundFromState,
  loadProductBackgroundState,
  productBackgroundState,
  refreshProductBackgroundState,
  stopBackgroundFromState,
  type RegistrationPhase,
} from "../../lib/background";
import { t } from "../../lib/i18n";
import { finish, radius, type Tone } from "../../lib/theme";
import {
  hostFacts,
  lifecycleLabel,
  loadHostFacts,
  restartBackground,
  startBackground,
  stopBackground,
} from "./hostFacts";

function phaseLabel(phase: RegistrationPhase | undefined): string {
  switch (phase) {
    case "notRegistered":
      return t("background.phase.notRegistered");
    case "pendingApproval":
      return t("background.phase.pendingApproval");
    case "registered":
      return t("background.phase.registered");
    case "denied":
      return t("background.phase.denied");
    case "failed":
      return t("background.phase.failed");
    default:
      return "—";
  }
}

function phaseTone(phase: RegistrationPhase | undefined): Tone {
  switch (phase) {
    case "registered":
      return "up";
    case "pendingApproval":
      return "warn";
    case "denied":
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function lifecycleTone(phase: string | undefined): Tone {
  switch (phase) {
    case "ready":
      return "up";
    case "failed":
      return "danger";
    case "starting":
    case "preparing":
    case "recovering":
    case "stopping":
      return "warn";
    default:
      return "neutral";
  }
}

export function BackgroundSection() {
  effect(() => {
    untracked(() => {
      void loadHostFacts();
      void loadProductBackgroundState();
    });
  });

  const facts = hostFacts;
  const state = productBackgroundState;

  return (
    <Scroll
      testID="settings-background"
      style={{ flex: 1 }}
      contentStyle={{ padding: 20, gap: 16, maxWidth: 720 }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: token("foreground") }}>
          {t("settings.background.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
          {t("settings.background.note")}
        </Text>
      </View>

      <Card title={t("settings.background.hostCard")}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
            <Text style={{ fontSize: 12, color: token("muted-foreground") }}>Host</Text>
            <Badge tone={facts().reachable ? "up" : "neutral"}>
              {facts().reachable ? t("background.connected") : t("background.disconnected")}
            </Badge>
          </View>
          <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
            <Text style={{ fontSize: 12, color: token("muted-foreground") }}>dsh web</Text>
            <Badge tone={lifecycleTone(facts().status?.phase)}>
              {facts().status?.phase
                ? lifecycleLabel(facts().status?.phase)
                : facts().reachable
                  ? t("background.unknown")
                  : t("background.notRunning")}
            </Badge>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
              {t("settings.background.hostVersion")}
            </Text>
            <Text
              testID="settings-host-version"
              style={{ fontSize: 13, color: token("foreground") }}
            >
              {facts().hostVersion ?? "—"}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
              {t("settings.background.dshVersion")}
            </Text>
            <Text
              testID="settings-dsh-version"
              style={{ fontSize: 13, color: token("foreground") }}
            >
              {facts().actualDsh ?? "—"}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
              {t("settings.background.dshSupported")}
            </Text>
            <Text
              testID="settings-dsh-supported"
              style={{ fontSize: 13, color: token("foreground") }}
            >
              {facts().supportedDsh ?? "—"}
            </Text>
          </View>
        </View>
        <If when={facts().mismatch}>
          <Text
            testID="settings-dsh-mismatch"
            style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}
          >
            {facts().mismatch}
          </Text>
        </If>
        <If when={facts().errors.length > 0}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
              {t("settings.background.recentErrors")}
            </Text>
            <Each of={facts().errors}>
              {(error) => (
                <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
                  {error()}
                </Text>
              )}
            </Each>
          </View>
        </If>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" disabled={!facts().reachable} onPress={() => void startBackground()}>
            {t("settings.background.startDsh")}
          </Button>
          <Button
            size="sm"
            disabled={!facts().reachable}
            variant="secondary"
            onPress={() => void stopBackground()}
          >
            {t("settings.background.stopDsh")}
          </Button>
          <Button
            size="sm"
            disabled={!facts().reachable}
            variant="secondary"
            onPress={() => void restartBackground()}
          >
            {t("settings.background.restartDsh")}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => void loadHostFacts()}>
            {t("common.refresh")}
          </Button>
        </View>
      </Card>

      <Card title={t("settings.background.services")}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
          {t("background.note")}
        </Text>
        <If
          when={state().runnable}
          else={
            <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
              {t("background.desktopOnly")}
            </Text>
          }
        >
          <View style={{ gap: 12 }}>
            <UnitPhase
              testID="settings-host-phase"
              unit={t("background.host")}
              phase={state().view?.phase}
              reason={state().view?.reason}
              error={state().view?.enableError}
            />
            <If when={state().error}>
              <Alert variant="destructive">
                <AlertDescription>{state().error}</AlertDescription>
              </Alert>
            </If>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button onPress={() => void enableBackgroundFromState()}>
                {t("background.enable")}
              </Button>
              <Button variant="secondary" onPress={() => void stopBackgroundFromState()}>
                {t("background.stop")}
              </Button>
              <Button variant="ghost" onPress={() => void refreshProductBackgroundState()}>
                {t("common.refresh")}
              </Button>
            </View>
          </View>
        </If>
      </Card>
    </Scroll>
  );
}

function UnitPhase(props: {
  testID: string;
  unit: string;
  phase: RegistrationPhase | undefined;
  /** Why the unit is where it is: not installed, not running, or not there at all. */
  reason?: string | null;
  error: string | undefined;
}) {
  return (
    <View
      style={{
        flex: 1,
        gap: 6,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: token("line"),
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
        {props.unit}
      </Text>
      <View testID={props.testID} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Badge tone={phaseTone(props.phase)}>{phaseLabel(props.phase)}</Badge>
      </View>
      <If when={props.reason}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: token("muted-foreground") }}>
          {props.reason}
        </Text>
      </If>
      <If when={props.error}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
          {props.error}
        </Text>
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

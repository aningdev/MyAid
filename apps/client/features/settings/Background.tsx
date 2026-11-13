/**
 * Settings › Background: the Host and dsh web's live status (from the Host's
 * public control API) beside the two Background Services' OS registration
 * (ADR 0002, ADR 0007). The page only orchestrates the verbs; the Host's
 * lifecycle owns start / stop / restart and each unit's registration owns
 * enable / stop.
 */
import { effect, Scroll, Text, untracked, View, type JSX } from "nsh";

import { Badge, Button, colors, finish, radius, type Tone } from "../../components/ui";
import {
  enableBackgroundFromState,
  loadProductBackgroundState,
  productBackgroundState,
  refreshProductBackgroundState,
  stopBackgroundFromState,
  type RegistrationPhase,
} from "../../lib/background";
import { t } from "../../lib/i18n";
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

function availabilityLabel(value: string | undefined): string {
  switch (value) {
    case "full":
      return t("background.phase.full");
    case "degraded":
      return t("background.phase.degraded");
    case "off":
      return t("background.phase.off");
    default:
      return "—";
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
        <Text style={{ fontSize: 20, fontWeight: "600", color: colors.text }}>
          {t("settings.background.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          {t("settings.background.note")}
        </Text>
      </View>

      <Card title={t("settings.background.hostCard")}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>Host</Text>
            <Badge
              label={facts().reachable ? t("background.connected") : t("background.disconnected")}
              tone={facts().reachable ? "up" : "neutral"}
            />
          </View>
          <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>dsh web</Text>
            <Badge
              label={
                facts().status?.phase
                  ? lifecycleLabel(facts().status?.phase)
                  : facts().reachable
                    ? t("background.unknown")
                    : t("background.notRunning")
              }
              tone={lifecycleTone(facts().status?.phase)}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {t("settings.background.hostVersion")}
            </Text>
            <Text testID="settings-host-version" style={{ fontSize: 13, color: colors.text }}>
              {facts().hostVersion ?? "—"}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {t("settings.background.dshVersion")}
            </Text>
            <Text testID="settings-dsh-version" style={{ fontSize: 13, color: colors.text }}>
              {facts().actualDsh ?? "—"}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {t("settings.background.dshSupported")}
            </Text>
            <Text testID="settings-dsh-supported" style={{ fontSize: 13, color: colors.text }}>
              {facts().supportedDsh ?? "—"}
            </Text>
          </View>
        </View>
        <If when={facts().mismatch}>
          <Text
            testID="settings-dsh-mismatch"
            style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}
          >
            {facts().mismatch}
          </Text>
        </If>
        <If when={facts().errors.length > 0}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
              {t("settings.background.recentErrors")}
            </Text>
            <Each of={facts().errors}>
              {(error) => (
                <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
                  {error()}
                </Text>
              )}
            </Each>
          </View>
        </If>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label={t("settings.background.startDsh")}
            size="small"
            variant="accent"
            disabled={!facts().reachable}
            onPress={() => void startBackground()}
          />
          <Button
            label={t("settings.background.stopDsh")}
            size="small"
            disabled={!facts().reachable}
            onPress={() => void stopBackground()}
          />
          <Button
            label={t("settings.background.restartDsh")}
            size="small"
            disabled={!facts().reachable}
            onPress={() => void restartBackground()}
          />
          <Button
            label={t("common.refresh")}
            size="small"
            variant="ghost"
            onPress={() => void loadHostFacts()}
          />
        </View>
      </Card>

      <Card title={t("settings.background.services")}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>{t("background.note")}</Text>
          <Badge label={availabilityLabel(state().view?.availability)} />
        </View>
        <If
          when={state().runnable}
          else={
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
              {t("background.desktopOnly")}
            </Text>
          }
        >
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <UnitPhase
                testID="settings-host-phase"
                unit={t("background.host")}
                phase={state().view?.host.phase}
                reason={state().view?.host.reason}
                error={state().view?.enableErrors?.host}
              />
              <UnitPhase
                testID="settings-relay-phase"
                unit={t("background.relay")}
                phase={state().view?.relay.phase}
                reason={state().view?.relay.reason}
                error={state().view?.enableErrors?.relay}
              />
            </View>
            <If when={state().error}>
              <Text style={{ fontSize: 13, color: colors.danger }}>{state().error}</Text>
            </If>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button
                label={t("background.enable")}
                variant="accent"
                onPress={() => void enableBackgroundFromState()}
              />
              <Button label={t("background.stop")} onPress={() => void stopBackgroundFromState()} />
              <Button
                label={t("common.refresh")}
                variant="ghost"
                onPress={() => void refreshProductBackgroundState()}
              />
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
        borderColor: colors.line,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{props.unit}</Text>
      <View testID={props.testID} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Badge label={phaseLabel(props.phase)} tone={phaseTone(props.phase)} />
      </View>
      <If when={props.reason}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>{props.reason}</Text>
      </If>
      <If when={props.error}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>{props.error}</Text>
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

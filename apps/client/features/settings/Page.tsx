/**
 * Settings Panel: the Client side of the two Background Services (ADR 0002, ADR 0007).
 * It shows the Host and Relay registration facts the OS reports and issues
 * the verbs — query, enable, stop. The facts come over each unit's own
 * loopback HTTP API (`lib/host/registration`, `lib/relay/registration`); this
 * page only orchestrates and renders them.
 */
import { effect, Scroll, Text, View } from "nsh";

import { Badge, Button, colors, type Tone } from "../../components/ui";
import {
  enableBackgroundFromState,
  loadProductBackgroundState,
  productBackgroundState,
  refreshProductBackgroundState,
  stopBackgroundFromState,
  type RegistrationPhase,
} from "../../lib/background";

function phaseLabel(phase: RegistrationPhase | undefined): string {
  switch (phase) {
    case "notRegistered":
      return "Not registered";
    case "pendingApproval":
      return "Waiting for approval";
    case "registered":
      return "Registered";
    case "denied":
      return "Denied";
    case "failed":
      return "Failed";
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
      return "Full";
    case "degraded":
      return "Degraded";
    case "off":
      return "Off";
    default:
      return "—";
  }
}

export function SettingsPage() {
  effect(() => {
    void loadProductBackgroundState();
  });

  const state = productBackgroundState;

  return (
    <View testID="settings-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 6, maxWidth: 640 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
            Background Services
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
            Host and Relay register with the OS as two independent services. Enabling asks for both;
            stopping withdraws both. Either may stay denied without rolling back the other.
          </Text>
        </View>
        <If
          when={state().runnable}
          else={
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
              Background Services run on desktop only. Mobile clients reach the Host through Relay.
            </Text>
          }
        >
          <View style={{ gap: 12, maxWidth: 640 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>Availability</Text>
              <Badge label={availabilityLabel(state().view?.availability)} />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <UnitPhase
                testID="settings-host-phase"
                unit="Host"
                phase={state().view?.host.phase}
                reason={state().view?.host.reason}
                error={state().view?.enableErrors?.host}
              />
              <UnitPhase
                testID="settings-relay-phase"
                unit="Relay"
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
                label="Enable"
                variant="accent"
                onPress={() => void enableBackgroundFromState()}
              />
              <Button label="Stop" onPress={() => void stopBackgroundFromState()} />
              <Button
                label="Refresh"
                variant="ghost"
                onPress={() => void refreshProductBackgroundState()}
              />
            </View>
          </View>
        </If>
      </Scroll>
    </View>
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

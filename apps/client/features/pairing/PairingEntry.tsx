/**
 * The Pairing entry: the whole app for a Device that has no Runner yet. Paste
 * the link the Runner showed, name this Device, and the Shell takes over. The
 * link lives in this page's signal only; nothing here writes it or the psk
 * anywhere.
 */
import { signal, Scroll, Text, View, token } from "nsh";

import {
  clearDeviceNotice,
  clearPairingError,
  deviceName,
  deviceNameDraft,
  deviceNotice,
  devicePhase,
  pairWithLink,
  pairingError,
  platformName,
  setDeviceName,
  type DeviceNotice,
  type DevicePhase,
} from "../../components/shell/device";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Field, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Spinner } from "../../components/ui/spinner";
import type { RelayErrorCode } from "../../lib/carrier/relay/errors";
import { t } from "../../lib/i18n";
import { mono } from "../../lib/theme";
import { pairingErrorText } from "./copy";

/** The entry, wired to this Client's Device state. */
export function PairingEntry() {
  const link = signal("");
  const submit = (): void => {
    void pairWithLink(link()).then(() => link.set(""));
  };
  return (
    <PairingView
      phase={devicePhase}
      error={pairingError}
      notice={deviceNotice}
      name={deviceNameDraft}
      namePlaceholder={platformName}
      link={link}
      onName={(value) => {
        clearPairingError();
        setDeviceName(value);
      }}
      onLink={(value) => {
        clearPairingError();
        link.set(value);
      }}
      onSubmit={submit}
      onDismissNotice={clearDeviceNotice}
    />
  );
}

/**
 * The entry as drawn. Fixtures render it directly in screenshots; a Device
 * renders it over `components/shell/device.ts`.
 */
export interface PairingViewProps {
  phase: () => DevicePhase;
  error: () => RelayErrorCode | null;
  notice: () => DeviceNotice | null;
  name: () => string;
  /** The name an empty field takes, shown as its placeholder. */
  namePlaceholder: () => string;
  link: () => string;
  onName: (value: string) => void;
  onLink: (value: string) => void;
  onSubmit: () => void;
  onDismissNotice: () => void;
}

export function PairingView(props: PairingViewProps) {
  const busy = () => props.phase() === "pairing";
  return (
    <Scroll
      testID="pairing"
      style={{ flex: 1, backgroundColor: token("background") }}
      contentStyle={{
        flexGrow: 1,
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: "100%", maxWidth: 420, gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text
            testID="pairing-title"
            style={{ fontSize: 22, fontWeight: "600", color: token("foreground") }}
          >
            {t("pairing.title")}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
            {t("pairing.note")}
          </Text>
        </View>

        <If when={props.notice() === "removed"}>
          <Alert testID="pairing-removed" variant="destructive">
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ gap: 2 }}>
                <AlertTitle>{t("pairing.removedTitle")}</AlertTitle>
                <AlertDescription>{t("pairing.removedNote")}</AlertDescription>
              </View>
              <Button
                size="sm"
                variant="ghost"
                style={{ alignSelf: "flex-start" }}
                onPress={props.onDismissNotice}
              >
                {t("common.dismiss")}
              </Button>
            </View>
          </Alert>
        </If>

        <If when={props.phase() === "starting"}>
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <Spinner size={18} tint={token("muted-foreground")} />
          </View>
        </If>

        <If when={props.phase() !== "starting"}>
          <View style={{ gap: 14 }}>
            <Field>
              <FieldLabel>{t("pairing.link")}</FieldLabel>
              <Input
                testID="pairing-link"
                accessibilityLabel={t("pairing.link")}
                value={props.link()}
                placeholder={t("pairing.linkPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                readonly={busy()}
                onChange={(event) => props.onLink(event.value)}
                style={{
                  fontFamily: mono,
                  fontSize: 12,
                  minHeight: 64,
                  maxHeight: 120,
                }}
              />
            </Field>

            <Field>
              <FieldLabel>{t("pairing.name")}</FieldLabel>
              <Input
                testID="pairing-name"
                accessibilityLabel={t("pairing.name")}
                value={props.name()}
                placeholder={props.namePlaceholder()}
                autoCapitalize="words"
                autoCorrect={false}
                readonly={busy()}
                onChange={(event) => props.onName(event.value)}
              />
            </Field>

            <If when={props.error() !== null}>
              <Text
                testID="pairing-error"
                style={{ fontSize: 13, lineHeight: 19, color: token("destructive") }}
              >
                {pairingErrorText(props.error()!)}
              </Text>
            </If>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Button
                testID="pairing-connect"
                busy={busy()}
                disabled={busy() || props.link().trim() === ""}
                onPress={props.onSubmit}
              >
                {busy() ? t("pairing.connecting") : t("pairing.connect")}
              </Button>
              <If when={busy()}>
                <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
                  {t("pairing.connectingNote")}
                </Text>
              </If>
            </View>
          </View>
        </If>
      </View>
    </Scroll>
  );
}

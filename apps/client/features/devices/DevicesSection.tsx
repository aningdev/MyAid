/**
 * Settings › Devices, on the Runner's Client only. Add a Device by a pairing
 * link (a QR code and a copy button), then revoke one after a confirmation.
 * The list follows `/watch`. The link is shown here and nowhere else.
 */
import type { JSX } from "nsh";
import {
  Canvas,
  Clipboard,
  cleanup,
  effect,
  Scroll,
  signal,
  Text,
  untracked,
  View,
  token,
} from "nsh";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card as CardFrame, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import type { PairedDevice } from "../../lib/host/protocol";
import { t } from "../../lib/i18n";
import { mono } from "../../lib/theme";
import { countdown, pairingExpired, relayReasonText, seenLabel } from "./copy";
import { qrModules } from "./qr";
import {
  createPairing,
  devicesError,
  devicesPhase,
  devicesSaving,
  followDevices,
  pairedDevices,
  pairingError,
  pairingTicket,
  relayStatus,
  revokePaired,
  stopDevices,
} from "./state";

/** The code's side, in points. A raster a camera can read, not a layout step. */
const QR_SIDE = 196;

export function DevicesSection() {
  effect(() => {
    untracked(() => {
      void followDevices();
    });
    cleanup(() => stopDevices());
  });

  // `tick` is what reruns the clock. The time itself is read when the label draws,
  // so the first paint is not stuck on the moment the page opened.
  const tick = signal(0);
  effect(() => {
    if (!pairingTicket()) return;
    const timer = setInterval(() => tick.update((n) => n + 1), 1000);
    cleanup(() => clearInterval(timer));
  });
  const now = () => {
    tick();
    return Date.now();
  };

  const phase = devicesPhase;
  const relay = relayStatus;
  const ticket = pairingTicket;
  const expired = () => {
    const current = ticket();
    return current ? pairingExpired(current.expiresAt, now()) : false;
  };
  /** The link still in its lifetime, or "" once it is gone or past `expiresAt`. */
  const liveLink = () => {
    const current = ticket();
    if (!current || pairingExpired(current.expiresAt, now())) return "";
    return current.link;
  };
  return (
    <Scroll
      testID="settings-devices"
      style={{ flex: 1 }}
      contentStyle={{ padding: 20, gap: 16, maxWidth: 720 }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: token("foreground") }}>
          {t("devices.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
          {t("devices.note")}
        </Text>
      </View>

      <If when={phase() === "loading" || phase() === "idle"}>
        <Text style={{ fontSize: 13, color: token("muted-foreground") }}>
          {t("common.reading")}
        </Text>
      </If>

      <If when={phase() === "down"}>
        <View style={{ gap: 8, alignItems: "flex-start" }}>
          <Text
            testID="devices-down"
            style={{ fontSize: 13, lineHeight: 19, color: token("destructive") }}
          >
            {devicesError() ?? t("devices.down")}
          </Text>
          <Button testID="devices-retry" size="sm" onPress={() => void followDevices()}>
            {t("common.retry")}
          </Button>
        </View>
      </If>

      <If when={phase() === "ready" && relay()?.configured === false}>
        <Text
          testID="devices-relay-reason"
          style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}
        >
          {relayReasonText(relay()?.reason)}
        </Text>
      </If>

      <If when={phase() === "ready" && relay()?.configured === true}>
        <Card title={t("devices.pairingTitle")}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Badge tone={relay()?.connected ? "up" : "warn"}>
                {relay()?.connected ? t("devices.relay.connected") : t("devices.relay.connecting")}
              </Badge>
            </View>
            <If when={relay()?.connected === false && !!relay()?.reason}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: token("muted-foreground") }}>
                {relayReasonText(relay()?.reason)}
              </Text>
            </If>
            <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
              {t("devices.replaces")}
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Button
                testID="devices-add"
                size="sm"
                busy={devicesSaving()}
                disabled={devicesSaving()}
                onPress={() => void createPairing()}
              >
                {ticket() && expired() ? t("devices.regenerate") : t("devices.add")}
              </Button>
            </View>
            <If when={pairingError()}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
                {relayReasonText(pairingError())}
              </Text>
            </If>
            <If when={ticket() !== null && expired()}>
              <Text
                testID="devices-expired"
                style={{ fontSize: 13, lineHeight: 19, color: token("foreground") }}
              >
                {t("devices.expired")}
              </Text>
            </If>
            <If when={liveLink() !== ""}>
              <View style={{ gap: 8, alignItems: "flex-start" }}>
                {/* A new link is a new row, so the code is painted for that link. */}
                <Each of={liveLink() ? [liveLink()] : []} key={(link) => link}>
                  {(link) => <PairingCode link={link()} />}
                </Each>
                <Text
                  testID="devices-countdown"
                  style={{ fontSize: 13, color: token("foreground") }}
                >
                  {t("devices.expiresIn", {
                    time: countdown(ticket()?.expiresAt ?? 0, now()),
                  })}
                </Text>
                <Text
                  testID="devices-link"
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    lineHeight: 18,
                    color: token("foreground"),
                  }}
                >
                  {liveLink()}
                </Text>
                <CopyLink link={liveLink()} />
              </View>
            </If>
          </View>
        </Card>
      </If>

      <If when={phase() === "ready"}>
        <Card title={t("devices.listTitle")}>
          <If
            when={pairedDevices().length === 0}
            else={
              <View style={{ gap: 0 }}>
                <Each of={pairedDevices()} key={(device) => device.deviceId}>
                  {(device, index) => <DeviceRow device={device} index={index} now={now} />}
                </Each>
              </View>
            }
          >
            <Text testID="devices-empty" style={{ fontSize: 13, color: token("muted-foreground") }}>
              {t("devices.empty")}
            </Text>
          </If>
          <If when={devicesError() && phase() === "ready"}>
            <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
              {devicesError()}
            </Text>
          </If>
        </Card>
      </If>
    </Scroll>
  );
}

/** One paired Device. Its confirm dialog is born with this Device's name. */
function DeviceRow(props: { device: () => PairedDevice; index: () => number; now: () => number }) {
  const device = () => props.device();
  const confirming = signal(false);
  return (
    <View
      testID={`devices-row-${device().deviceId}`}
      style={{
        gap: 4,
        paddingVertical: 10,
        borderTopWidth: props.index() === 0 ? 0 : 1,
        borderTopColor: token("line"),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: "600",
            color: token("foreground"),
          }}
        >
          {device().name}
        </Text>
        <Badge tone={device().online ? "up" : "neutral"}>
          {device().online ? t("devices.online") : t("devices.offline")}
        </Badge>
      </View>
      <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
        {t("devices.platform", { platform: device().platform })}
      </Text>
      <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
        {t("devices.lastSeen", { time: seenLabel(device().lastSeenAt, props.now()) })}
      </Text>
      <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
        {t("devices.paired", { time: seenLabel(device().pairedAt, props.now()) })}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <Button
          testID={`devices-revoke-${device().deviceId}`}
          size="sm"
          variant="destructive"
          disabled={devicesSaving()}
          accessibilityLabel={t("devices.revokeName", { name: device().name })}
          onPress={() => confirming.set(true)}
        >
          {t("devices.revoke")}
        </Button>
      </View>
      <AlertDialog
        open={confirming()}
        onOpenChange={(event) => confirming.set(event.open)}
        onAction={(event) => {
          if (event.action === "revoke-device") void revokePaired(device().deviceId);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t("devices.revokeTitle", { name: device().name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("devices.revokeNote")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction id="revoke-device" role="destructive">
              {t("devices.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}

/**
 * The link as a black-on-white code. Scanners need that contrast in either
 * theme, so these two literals stay off the token palette. The row is rebuilt
 * per link (`Each` key), and this function runs once for that link.
 */
function PairingCode(props: { link: string }) {
  const modules = qrModules(props.link);
  const size = modules.length;
  return (
    <View testID="devices-qr" style={{ width: QR_SIDE, height: QR_SIDE }}>
      <Canvas
        style={{ width: QR_SIDE, height: QR_SIDE }}
        draw={(cx, { width, height }) => {
          const cell = Math.max(1, Math.floor(Math.min(width, height) / size));
          const span = cell * size;
          const x0 = Math.floor((width - span) / 2);
          const y0 = Math.floor((height - span) / 2);
          cx.fillStyle = "#ffffff";
          cx.fillRect(0, 0, width, height);
          cx.fillStyle = "#000000";
          for (let y = 0; y < size; y++) {
            const row = modules[y];
            if (!row) continue;
            for (let x = 0; x < size; x++) {
              if (row[x]) cx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
            }
          }
        }}
      />
    </View>
  );
}

function CopyLink(props: { link: string }) {
  const copied = signal(false);
  return (
    <View style={{ flexDirection: "row" }}>
      <Button
        testID="devices-copy"
        size="sm"
        variant="secondary"
        onPress={() => {
          void Clipboard.writeText(props.link);
          copied.set(true);
          setTimeout(() => copied.set(false), 1600);
        }}
      >
        {copied() ? t("devices.copied") : t("devices.copy")}
      </Button>
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

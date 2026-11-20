/**
 * Settings › This Device, on a Device's Client only. Disconnecting forgets
 * the pairing stored here and returns to the Pairing entry; the Runner keeps
 * its record until it is revoked there.
 */
import { signal, Text, View, token } from "nsh";

import { disconnectDevice, platformName } from "../../components/shell/device";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Card as CardFrame, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { t } from "../../lib/i18n";

export function DeviceSection() {
  const confirming = signal(false);
  return (
    <View testID="settings-device" style={{ flex: 1, padding: 20, gap: 16, maxWidth: 720 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: token("foreground") }}>
          {t("device.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
          {t("device.note")}
        </Text>
      </View>

      <CardFrame>
        <CardHeader>
          <CardTitle>{t("device.pairingTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <View style={{ gap: 10 }}>
            <Text
              testID="device-platform"
              style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}
            >
              {t("device.platform", { platform: platformName() })}
            </Text>
            <View style={{ flexDirection: "row" }}>
              <Button
                testID="device-disconnect"
                size="sm"
                variant="destructive"
                onPress={() => confirming.set(true)}
              >
                {t("device.disconnect")}
              </Button>
            </View>
          </View>
        </CardContent>
      </CardFrame>

      <AlertDialog
        open={confirming()}
        onOpenChange={(event) => confirming.set(event.open)}
        onAction={(event) => {
          if (event.action === "disconnect-device") {
            confirming.set(false);
            void disconnectDevice();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t("device.disconnectTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("device.disconnectNote")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction id="disconnect-device" role="destructive">
              {t("device.disconnectAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}

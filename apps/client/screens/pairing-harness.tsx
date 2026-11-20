/**
 * Test-only entry: the Pairing entry as a picture. The product draws it over
 * `components/shell/device.ts`; here the state is fixture storage, so a
 * screenshot can show the entry, an error and the removed-Device notice.
 * Nothing in the product imports this file.
 */
import { effect, mount, signal, Storage, token, View } from "nsh";

import { PairingView } from "../features/pairing/PairingEntry";
import type { RelayErrorCode } from "../lib/carrier/relay/errors";

/** `unpaired`, `error:<code>` or `removed`. */
export const PAIRING_SHOT_KEY = "dsh-bot.test.pairing-shot";

function Harness() {
  const mode = signal("unpaired");
  const name = signal("Pixel");
  const link = signal("");
  effect(() => {
    void Storage.getItem(PAIRING_SHOT_KEY).then((value) => {
      if (value) mode.set(value);
    });
  });
  const error = (): RelayErrorCode | null =>
    mode().startsWith("error:") ? (mode().slice("error:".length) as RelayErrorCode) : null;
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: token("background") }}>
      <PairingView
        phase={() => "unpaired"}
        error={error}
        notice={() => (mode() === "removed" ? "removed" : null)}
        name={name}
        namePlaceholder={() => "Pixel"}
        link={link}
        onName={(value) => name.set(value)}
        onLink={(value) => link.set(value)}
        onSubmit={() => undefined}
        onDismissNotice={() => mode.set("unpaired")}
      />
    </View>
  );
}

mount(Harness);

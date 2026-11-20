/**
 * Test-only entry: the Navigator over an in-memory `bots` Remote. A button
 * publishes a snapshot the way another Device's write arrives on `watch`.
 * Nothing in the product imports this file.
 */
import { mount, View } from "nsh";

import { Navigator } from "../../components/shell/Navigator";
import { Button } from "../../components/ui/button";
import {
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  mainBot,
} from "../../test/bots-fixture";
import { createMemoryBots } from "./memory";
import { followBots } from "./state";

const seed = mainBot(
  initializeBot(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl" },
      "ada",
    ),
    "ada",
  ),
);

const memory = createMemoryBots(seed);
void followBots(memory);

function WatchHarness() {
  return (
    <View style={{ width: 320, height: 640 }}>
      <Button
        testID="other-device"
        accessibilityLabel="Other device"
        variant="secondary"
        size="sm"
        onPress={() => {
          memory.publish({
            ...seed,
            bots: seed.bots.map((bot) => (bot.id === "ada" ? { ...bot, name: "Ada L" } : bot)),
          });
        }}
      >
        Other device
      </Button>
      <Navigator />
    </View>
  );
}

mount(WatchHarness);

/**
 * A Panel's body: the Bot, Dialogue, Session or Settings view its Nav address
 * names. A Panel's content follows its address; it holds no state of its own.
 */
import { View } from "nsh";

import { BotPanel } from "../../features/bots/BotPanel";
import { DialoguePanel } from "../../features/dialogue/DialoguePanel";
import { SessionPanel } from "../../features/dialogue/SessionPanel";
import { SettingsPage } from "../../features/settings/Page";
import { SlotPlaceholder } from "./SlotPlaceholder";
import { panelContents } from "./state";

export function PanelView(props: { panelId: string }) {
  const address = () => panelContents()[props.panelId] ?? null;
  const kind = () => address()?.kind ?? null;
  return (
    <View class="min-h-0 min-w-0 flex-1">
      <If when={address()} else={<SlotPlaceholder panelId={props.panelId} />}>
        <If
          when={kind() === "setting"}
          else={
            <If
              when={kind() === "session"}
              else={
                <If
                  when={kind() === "dialogue"}
                  else={
                    <If when={kind() === "bot"} else={<SlotPlaceholder panelId={props.panelId} />}>
                      <BotPanel panelId={props.panelId} botId={address()?.botId ?? null} />
                    </If>
                  }
                >
                  <DialoguePanel panelId={props.panelId} dialogueId={address()?.dialogueId ?? ""} />
                </If>
              }
            >
              <SessionPanel panelId={props.panelId} sessionId={address()?.sessionId ?? ""} />
            </If>
          }
        >
          <SettingsPage />
        </If>
      </If>
    </View>
  );
}

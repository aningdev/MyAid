/**
 * A Pane's body: the Bot's conversation, or the empty slot. A Pane's content
 * is its Bot id; it holds no state of its own.
 */
import { View } from "nsh";

import { BotPane } from "../../features/bots/BotPane";
import { SlotPlaceholder } from "./SlotPlaceholder";
import { panelBotId } from "./state";

export function PanelView(props: { panelId: string }) {
  const botId = () => panelBotId(props.panelId);
  return (
    <View class="min-h-0 min-w-0 flex-1">
      <If when={botId()} else={<SlotPlaceholder />}>
        {(id) => <BotPane panelId={props.panelId} botId={id()} />}
      </If>
    </View>
  );
}

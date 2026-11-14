/**
 * A rounded tile around an icon — the mark a page's empty state shows.
 * shadcn-nsh's `ItemMedia variant="icon"` is the tile inside a row; this one
 * takes any side, so it stays a product composition.
 */
import type { IconNode } from "lucide";
import { token, View } from "nsh";

import { Icon } from "../../lib/icons";

export function IconTile(props: { icon: IconNode; tint?: string; size?: number }) {
  const size = props.size ?? 40;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: token("border"),
        backgroundColor: token("inset"),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon icon={props.icon} size={size * 0.5} tint={props.tint ?? token("foreground")} />
    </View>
  );
}

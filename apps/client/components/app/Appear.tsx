/**
 * Fades and lifts its content in once mounted; `index` staggers siblings
 * (40 ms apart). `flex` lets it wrap a page that fills its parent. The motion
 * is the theme's `enter`, and reduced motion shows the content at once.
 */
import type { JSX } from "nsh";
import { createAnimatedValue, reduceMotion, View } from "nsh";

import { motion } from "../../lib/theme";

export function Appear(props: { index?: number; flex?: boolean; children: JSX.Element }) {
  const reduced = reduceMotion();
  const t = createAnimatedValue(reduced ? 1 : 0);
  if (!reduced) t.timing(1, { ...motion.enter, delay: Math.min(8, props.index ?? 0) * 40 });
  return (
    <View
      style={{
        flex: props.flex ? 1 : undefined,
        opacity: t,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {props.children}
    </View>
  );
}

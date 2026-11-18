// An avatar: the identity ring (`avatarIdentity`, `avatarHue`) and the `Avatar` that wears it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { isDark } from "../../lib/theme";
import { split } from "nsh";
import type { ViewStyle } from "nsh";
import { Avatar as BaseAvatar, type AvatarProps as BaseAvatarProps } from "nsh/base";

/** The hues of the identity ring: twelve, evenly spaced. */
const HUES = 12;

/** FNV-1a of `text`: a stable hash, so a name keeps its hue. */
function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The hue of `name` on the ring, in degrees. */
export const avatarHue = (name: string) => (hash(name) % HUES) * (360 / HUES);

/** `#rrggbb` of an OkLCH color (clipped to sRGB), so it fits an arbitrary
 * Tailwind class (`text-[#…]`) as well as a style. */
function oklch(l: number, c: number, h: number): string {
  const r = (h * Math.PI) / 180;
  const a = c * Math.cos(r);
  const b = c * Math.sin(r);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return (
    "#" +
    channel(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3) +
    channel(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3) +
    channel(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)
  );
}

/**
 * The colors a fallback with `name`'s initials draws itself in, as
 * `gpui-component`'s avatar picks them: twelve OkLCH hues at one lightness
 * and chroma, so every avatar has one visual weight and its initials hold
 * WCAG AA on every hue, in light and dark appearance.
 */
export function avatarIdentity(name: string) {
  const h = avatarHue(name);
  return isDark()
    ? {
        background: oklch(0.3, 0.05, h),
        foreground: oklch(0.82, 0.11, h),
        border: oklch(0.36, 0.06, h),
      }
    : {
        background: oklch(0.97, 0.032, h),
        foreground: oklch(0.5, 0.145, h),
        border: oklch(0.89, 0.05, h),
      };
}


/**
 * `nsh/base`'s Avatar with identity colors for a named fallback. Every base prop passes through.
 * `name` drives initials and hue via `avatarIdentity`; `src` is the picture, if there is one.
 */
export type AvatarProps = BaseAvatarProps;

/** An avatar: picture or named initials on the identity ring. */
export function Avatar(props: AvatarProps) {
  const [, rest] = split(props, ["style", "fallbackStyle", "fallbackClass", "imageClass"]);
  // Read where used, so the identity colors follow the name and the appearance (light / dark).
  const identity = () => (props.name ? avatarIdentity(props.name) : null);
  const ringClass = () => {
    const ring = identity();
    return ring
      ? `rounded-full overflow-hidden items-center justify-center font-semibold text-[${ring.foreground}]`
      : undefined;
  };
  const ringStyle = (): ViewStyle | null => {
    const ring = identity();
    return ring
      ? { backgroundColor: ring.background, borderWidth: 1, borderColor: ring.border }
      : null;
  };
  return (
    <BaseAvatar
      {...rest}
      style={props.style}
      imageClass={props.imageClass ?? "rounded-full overflow-hidden"}
      fallbackClass={props.fallbackClass ?? ringClass()}
      fallbackStyle={[ringStyle(), props.fallbackStyle ?? null]}
    />
  );
}

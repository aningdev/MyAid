/**
 * Settings › General: the interface language, the appearance and the accent.
 * Appearance and language apply at once (`components/ui/appearance`,
 * `lib/i18n`) and are saved with the other client preferences.
 */
import { Scroll, Text, View, type JSX } from "nsh";

import {
  ACCENTS,
  APPEARANCE_SCHEMES,
  accentChoice,
  applyAppearance,
  appearanceScheme,
  colors,
  darkNow,
  finish,
  Press,
  radius,
  Segmented,
  toneTint,
  type AccentChoice,
} from "../../components/ui";
import { LANGUAGES, languagePref, setLanguagePref, t } from "../../lib/i18n";

export function GeneralSection() {
  return (
    <Scroll
      testID="settings-general"
      style={{ flex: 1 }}
      contentStyle={{ padding: 20, gap: 16, maxWidth: 720 }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: colors.text }}>
          {t("settings.general.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          {t("settings.general.note")}
        </Text>
      </View>

      <Card title={t("settings.general.language")}>
        <Segmented
          size="small"
          options={LANGUAGES.map((language) => ({ value: language.id, label: t(language.label) }))}
          value={languagePref()}
          onChange={(value) => setLanguagePref(value as (typeof LANGUAGES)[number]["id"])}
        />
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
          {t("settings.general.languageNote")}
        </Text>
      </Card>

      <Card title={t("settings.general.appearance")}>
        <Segmented
          size="small"
          options={APPEARANCE_SCHEMES.map((scheme) => ({
            value: scheme.id,
            label: t(scheme.label),
          }))}
          value={appearanceScheme()}
          onChange={(value) =>
            applyAppearance({
              scheme: value as (typeof APPEARANCE_SCHEMES)[number]["id"],
              accent: accentChoice(),
            })
          }
        />
      </Card>

      <Card title={t("settings.general.accent")}>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Each of={ACCENTS}>
            {(accent) => (
              <Press
                onPress={() => applyAppearance({ scheme: appearanceScheme(), accent: accent().id })}
                accessibilityLabel={t("settings.accent.pick", { label: t(accent().label) })}
                accessibilityState={{ selected: accentChoice() === accent().id }}
                scale={0.94}
                style={{ alignItems: "center", gap: 5, minWidth: 52 }}
              >
                <Swatch accent={accent().id} selected={accentChoice() === accent().id} />
                <Text
                  style={{
                    fontSize: 11,
                    color: accentChoice() === accent().id ? colors.text : colors.muted,
                  }}
                >
                  {t(accent().label)}
                </Text>
              </Press>
            )}
          </Each>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 10,
              height: 28,
              borderRadius: 14,
              justifyContent: "center",
              backgroundColor: colors.accentFill,
              ...finish.accent,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onAccent }}>
              {t("settings.accent.preview")}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.accent }}>{t("settings.accent.text")}</Text>
        </View>
      </Card>
    </Scroll>
  );
}

/** One accent swatch: the theme's default is a split primary surface, others their own hue. */
function Swatch(props: { accent: AccentChoice; selected: boolean }) {
  const swatch = ACCENTS.find((entry) => entry.id === props.accent);
  const custom = props.accent !== "default" ? swatch : undefined;
  const fill = () => (custom ? (darkNow() ? custom.dark : custom.light) : colors.light);
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: fill(),
        borderWidth: 2,
        borderColor: props.selected ? colors.text : colors.border,
        boxShadow: props.selected ? `0 0 0 2px ${toneTint("accent")}` : undefined,
      }}
    />
  );
}

function Card(props: { title: string; note?: string; children: JSX.Element }) {
  return (
    <View
      style={{
        gap: 10,
        padding: 14,
        borderRadius: radius.card,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        ...finish.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.text }}>
          {props.title}
        </Text>
        <If when={props.note}>
          <Text style={{ fontSize: 11, color: colors.faint }}>{props.note}</Text>
        </If>
      </View>
      {props.children}
    </View>
  );
}

/**
 * Settings › General: the interface language, the scheme and the colour. Each
 * applies at once (`lib/appearance`, `lib/i18n`, `lib/themes`) and is saved
 * with the other client preferences.
 */
import { Scroll, Text, View } from "nsh";

import { OptionSegmented } from "../../components/app";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { APPEARANCE_SCHEMES, applyScheme, appearanceScheme } from "../../lib/appearance";
import { LANGUAGES, languagePref, setLanguagePref, t } from "../../lib/i18n";
import { THEMES, applyTheme, themePref } from "../../lib/themes";

/** The segment that stands for the build-time theme: a `Segmented` takes a string, and `null` is no id. */
const BUILD_TIME = "build-time";

export function GeneralSection() {
  return (
    <Scroll
      testID="settings-general"
      style={{ flex: 1 }}
      contentStyle={{ padding: 20, gap: 16, maxWidth: 720 }}
    >
      <View style={{ gap: 4 }}>
        <Text class="text-foreground" style={{ fontSize: 20, fontWeight: "600" }}>
          {t("settings.general.title")}
        </Text>
        <Text class="text-muted-foreground" style={{ fontSize: 13, lineHeight: 19 }}>
          {t("settings.general.note")}
        </Text>
      </View>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.language")}</CardTitle>
        </CardHeader>
        <CardContent style={{ gap: 8 }}>
          <OptionSegmented
            options={LANGUAGES.map((language) => ({
              value: language.id,
              label: t(language.label),
            }))}
            value={languagePref()}
            onValueChange={(value) => setLanguagePref(value as (typeof LANGUAGES)[number]["id"])}
            fill
          />
          <Text class="text-faint" style={{ fontSize: 12, lineHeight: 18 }}>
            {t("settings.general.languageNote")}
          </Text>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.appearance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <OptionSegmented
            options={APPEARANCE_SCHEMES.map((scheme) => ({
              value: scheme.id,
              label: t(scheme.label),
            }))}
            value={appearanceScheme()}
            onValueChange={(value) =>
              applyScheme(value as (typeof APPEARANCE_SCHEMES)[number]["id"])
            }
            fill
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.theme")}</CardTitle>
        </CardHeader>
        <CardContent style={{ gap: 8 }}>
          <OptionSegmented
            testID="settings-theme"
            options={THEMES.map((theme) => ({
              value: theme.id ?? BUILD_TIME,
              label: t(theme.label),
            }))}
            value={themePref() ?? BUILD_TIME}
            onValueChange={(value) => applyTheme(value === BUILD_TIME ? null : value)}
            fill
          />
          <Text class="text-faint" style={{ fontSize: 12, lineHeight: 18 }}>
            {t("settings.general.themeNote")}
          </Text>
        </CardContent>
      </Card>
    </Scroll>
  );
}

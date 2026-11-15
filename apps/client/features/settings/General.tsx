/**
 * Settings › General: the interface language and the scheme. Both apply at
 * once (`lib/appearance`, `lib/i18n`) and are saved with the other client
 * preferences. The colors come from the shadcn-nsh theme the app installed,
 * so there is no accent colour to choose.
 */
import { Scroll, Text, View } from "nsh";

import { OptionSegmented } from "../../components/app";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { APPEARANCE_SCHEMES, applyScheme, appearanceScheme } from "../../lib/appearance";
import { LANGUAGES, languagePref, setLanguagePref, t } from "../../lib/i18n";

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
    </Scroll>
  );
}

/**
 * Plugins module: list official `pluginManager.listPlugins` (enablement UI only).
 * Derived presets and Host injection stay in myaid-plugin-* / official Cordis packages.
 */
import type { PluginInfo } from "@myaid/dsh-web-protocol/plugins";
import { effect, Scroll, signal, Text, View } from "nsh";

import { Button, colors } from "../../components/ui";
import { FeaturePageHeader } from "../pageChrome";

const loading = signal(false);
const error = signal<string | null>(null);
const plugins = signal<PluginInfo[]>([]);

async function reload(): Promise<void> {
  loading.set(true);
  error.set(null);
  try {
    const { ensureConnected, listPlugins } = await import("../../lib/dsh/session");
    await ensureConnected();
    plugins.set(await listPlugins());
  } catch (err) {
    error.set(err instanceof Error ? err.message : String(err));
    plugins.set([]);
  } finally {
    loading.set(false);
  }
}

function pluginLabel(plugin: PluginInfo): string {
  const name =
    plugin.meta && "name" in plugin.meta ? String((plugin.meta as { name?: string }).name) : "";
  return name.trim() || plugin.moduleName;
}

function pluginDetail(plugin: PluginInfo): string {
  const bits = [
    String(plugin.entryId),
    plugin.enabled ? "启用" : "停用",
    plugin.fiberPhase ? String(plugin.fiberPhase) : null,
    plugin.diagnostic ? String(plugin.diagnostic) : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export function PluginsPage() {
  effect(() => {
    void reload();
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FeaturePageHeader title="Plugins" />
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted }}>
          官方插件清单来自 dsh pluginManager。产品能力扩展写在 myaid-plugin-*，不要依赖
          @myaid/dsh-web-protocol。
        </Text>
        <Button label="刷新" size="small" disabled={loading()} onPress={() => void reload()} />
        <If when={error()}>
          <Text style={{ fontSize: 13, color: colors.text }}>{error()}</Text>
        </If>
        <If when={loading() && plugins().length === 0}>
          <Text style={{ fontSize: 13, color: colors.muted }}>加载中…</Text>
        </If>
        <If when={!loading() && !error() && plugins().length === 0}>
          <Text style={{ fontSize: 13, color: colors.muted }}>还没有已安装的插件。</Text>
        </If>
        <Each of={plugins()}>
          {(item) => (
            <View
              style={{
                gap: 4,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                {pluginLabel(item())}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{pluginDetail(item())}</Text>
            </View>
          )}
        </Each>
      </Scroll>
    </View>
  );
}

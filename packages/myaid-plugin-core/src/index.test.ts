import { describe, expect, it } from "vite-plus/test";

import { PLUGIN_ID, pluginName } from "./index.ts";

describe("myaid-plugin-core", () => {
  it("exports shell identity", () => {
    expect(PLUGIN_ID).toBe("myaid-core");
    expect(pluginName()).toBe("@myaid/myaid-plugin-core");
  });
});

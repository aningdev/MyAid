import { defineConfig } from "vite-plus";

// vp fmt already respects .gitignore + .prettierignore and skips node_modules.
// oxlint discovery also skips .gitignore matches. Only list paths that are
// tracked (or otherwise walked) but should stay out of fmt/lint.
const ignoreVendored = ["references/**", ".agents/skills"];
// shadcn-nsh's CLI owns what it copies into the client, and `ui:diff` compares
// those files with the registry's: formatting them would make every one differ.
const ignoreCopied = [
  "apps/client/components/ui/**",
  "apps/client/theme.json",
  "apps/client/lib/finishes.json",
  "apps/client/lib/theme.ts",
  "apps/client/lib/surface.tsx",
  "apps/client/lib/press.ts",
  "apps/client/lib/icons.tsx",
  "apps/client/lib/icon-canvas.ts",
  "apps/client/lib/open-state.ts",
  "apps/client/lib/overlay.ts",
  "apps/client/lib/switch-geometry.ts",
];
// NSH client is type-checked by `nsh check` (QuickJS / nsh globals like If/Each).
// Host/relay are Cargo.
const ignoreLint = [
  ...ignoreVendored,
  "apps/client/**",
  "apps/host/**",
  "apps/relay/**",
  "scripts/**",
];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  fmt: {
    sortPackageJson: true,
    sortScripts: true,
    sortImports: true,
    sortTailwindcss: true,
    ignorePatterns: [...ignoreVendored, ...ignoreCopied],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {},
    options: { typeAware: true, typeCheck: true },
    plugins: ["eslint", "typescript", "react", "import", "promise", "node", "vitest"],
    ignorePatterns: ignoreLint,
  },

  staged: {
    "*": "vp check --fix",
  },
  test: {
    include: ["**/tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.git/**", "tests/browser/**"],
  },
});

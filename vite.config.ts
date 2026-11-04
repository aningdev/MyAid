import { defineConfig } from "vite-plus";

// vp fmt already respects .gitignore + .prettierignore and skips node_modules.
// oxlint discovery also skips .gitignore matches. Only list paths that are
// tracked (or otherwise walked) but should stay out of fmt/lint.
const ignoreVendored = ["references/**", ".agents/skills"];
// Docs types authority is `check:docs` (astro sync + tsc); vp type-aware lint
// does not load `astro/client`, so `import.meta.env` fails without this exclude.
const ignoreLint = [...ignoreVendored, "apps/docs/**"];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  fmt: {
    sortPackageJson: true,
    sortScripts: true,
    sortImports: true,
    sortTailwindcss: true,
    ignorePatterns: ignoreVendored,
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

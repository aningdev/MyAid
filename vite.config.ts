import { defineConfig } from "vite-plus";

// vp fmt already respects .gitignore + .prettierignore and skips node_modules.
// oxlint discovery also skips .gitignore matches. Only list paths that are
// tracked (or otherwise walked) but should stay out of fmt/lint.
const ignoreVendored = ["references/**", ".agents/skills"];
// NSH client is type-checked by `nsh check` (QuickJS / nsh globals like If/Each).
// Host/relay are Cargo. Docs/astro would need their own sync if reintroduced.
const ignoreLint = [
  ...ignoreVendored,
  "apps/client/**",
  "apps/host/**",
  "apps/relay/**",
  "apps/docs/**",
  "**/*.{test,spec}.{ts,tsx}",
];

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
  // Workspace orchestration: https://viteplus.dev/config/run + https://viteplus.dev/guide/run
  // Package-local scripts stay in each package.json; root tasks must not duplicate those names there.
  run: {
    tasks: {
      check: {
        command: [
          "vp check --fix",
          "vp run @myaid/myaid-plugin-core#check",
          "vp run @myaid/client#check",
          "cargo check --workspace",
        ],
      },
      build: {
        // client... includes workspace dependency plugin-core, in dep order
        command: "vp run --filter @myaid/client... build",
      },
      test: {
        command: [
          "cargo test --workspace",
          "vp run @myaid/myaid-plugin-core#test",
          "vp run @myaid/client#test",
        ],
      },
      dev: {
        command: "vp run @myaid/client#dev",
        cache: false,
      },
      "host:dev": {
        command: "cargo run --manifest-path apps/host/Cargo.toml -- serve-app",
        cache: false,
      },
    },
  },
  test: {
    include: ["**/tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.git/**", "tests/browser/**"],
  },
});

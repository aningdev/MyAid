/**
 * Docs check, run by `bun run check` (rules: docs/AGENTS.md).
 *
 * - Every relative Markdown link resolves to a file or directory, and every
 *   `#heading` fragment to a heading in its target (GitHub slugs).
 * - docs/ARCHITECTURE.md stays within 16 KiB; each docs/architecture/*.md
 *   within 24 KiB and listed in ARCHITECTURE's Subjects table.
 *
 * Covers tracked and untracked-but-not-ignored Markdown, minus references/ and
 * the vendored skills in .agents/ (both are upstream text). A link into a
 * submodule that is not checked out (CI clones without them) is not checked.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHITECTURE_LIMIT = 16 * 1024;
const SUBJECT_LIMIT = 24 * 1024;

/**
 * Markdown files the check covers.
 * @returns repository-relative paths.
 */
function markdownFiles() {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd: root, encoding: "utf8" },
  );
  return [...new Set(listed.split("\n"))].filter(
    (path) =>
      path !== "" &&
      !path.startsWith("references/") &&
      !path.startsWith(".agents/") &&
      existsSync(join(root, path)),
  );
}

/** Submodule directories with nothing checked out, as absolute paths. */
const absentSubmodules = (() => {
  let listed = "";
  try {
    listed = execFileSync("git", ["config", "-f", ".gitmodules", "--get-regexp", "path"], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  return listed
    .split("\n")
    .map((line) => line.split(" ")[1])
    .filter((path) => path !== undefined && !existsSync(join(root, path, ".git")))
    .map((path) => join(root, path));
})();

/**
 * Markdown text with fenced blocks and inline code blanked out, so links in
 * examples are not checked.
 * @param text - file contents.
 * @returns the prose only.
 */
function prose(text) {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

/**
 * GitHub's anchor for each heading in a Markdown file.
 * @param text - file contents.
 * @returns the set of anchors, duplicates suffixed the way GitHub does.
 */
function anchors(text) {
  const seen = new Map();
  const found = new Set();
  for (const [, heading] of prose(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = heading
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const [, id] of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) found.add(id.toLowerCase());
  return found;
}

/**
 * Broken relative links and fragments in one file.
 * @param path - repository-relative path.
 * @returns one problem per broken link.
 */
function linkProblems(path) {
  const text = readFileSync(join(root, path), "utf8");
  const problems = [];
  for (const [, rawTarget] of prose(text).matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) continue;
    const [file, fragment] = rawTarget.split("#", 2);
    const target =
      file === "" ? join(root, path) : resolve(join(root, dirname(path)), decodeURI(file));
    if (absentSubmodules.some((dir) => target === dir || target.startsWith(`${dir}/`))) continue;
    if (!existsSync(target)) {
      problems.push(`${path}: ${rawTarget} 不存在`);
      continue;
    }
    if (fragment === undefined || fragment === "" || statSync(target).isDirectory()) continue;
    if (!target.endsWith(".md")) continue;
    if (!anchors(readFileSync(target, "utf8")).has(decodeURIComponent(fragment).toLowerCase())) {
      problems.push(
        `${path}: ${rawTarget} 的 #${fragment} 在 ${relative(root, target)} 里没有对应标题`,
      );
    }
  }
  return problems;
}

/**
 * Size limits and Subjects-table coverage for the architecture docs.
 * @returns one problem per violation.
 */
function architectureProblems() {
  const problems = [];
  const architecture = join(root, "docs/ARCHITECTURE.md");
  if (!existsSync(architecture)) return ["docs/ARCHITECTURE.md 不存在"];
  const size = statSync(architecture).size;
  if (size > ARCHITECTURE_LIMIT) {
    problems.push(
      `docs/ARCHITECTURE.md 有 ${size} 字节，超过 ${ARCHITECTURE_LIMIT}；细节移到 docs/architecture/<subject>.md`,
    );
  }
  const text = readFileSync(architecture, "utf8");
  const subjects = /^## Subjects\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
  const dir = join(root, "docs/architecture");
  if (!existsSync(dir)) return problems;
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
    const subjectSize = statSync(join(dir, name)).size;
    if (subjectSize > SUBJECT_LIMIT) {
      problems.push(
        `docs/architecture/${name} 有 ${subjectSize} 字节，超过 ${SUBJECT_LIMIT}；拆成两个主题`,
      );
    }
    if (!subjects.includes(`architecture/${name}`)) {
      problems.push(`docs/architecture/${name} 没有列在 docs/ARCHITECTURE.md 的 Subjects 表里`);
    }
  }
  return problems;
}

const problems = [...markdownFiles().flatMap(linkProblems), ...architectureProblems()];
if (problems.length > 0) {
  console.error(`文档检查失败（${problems.length} 处）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

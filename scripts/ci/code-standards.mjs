#!/usr/bin/env node
/**
 * The code standards check: every rule in docs/standards/code.md a machine
 * can check, run by CI (`npm run code:standards`).
 *
 * It measures the repo, compares what it finds with the breaks listed in
 * scripts/ci/code-standards-exceptions.json, and fails when:
 *
 *   - something breaks a rule and is not listed (a new break), or
 *   - a listed break got worse (a long file grew past the size it was listed at), or
 *   - a listed break is gone (take it off the list, so the list only shrinks).
 *
 *   node scripts/ci/code-standards.mjs            check
 *   node scripts/ci/code-standards.mjs --update   rewrite the list from what is there now
 *
 * `--update` is for the PR that fixes a break (the list shrinks) or, rarely,
 * one that must add to it; a reviewer sees every line it adds.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/** The agreed limits (docs/standards/code.md, rules 3 to 5). */
export const LIMITS = {
  fileLines: 500,
  functionLines: 60,
  componentLines: 150,
  nesting: 4,
  parameters: 3,
};

/** Files no size rule applies to: written by a tool, or a plain list of data. */
export const EXEMPT = [
  /(^|\/)db-types\.ts$/,
  /\/generated\//,
  // The registry's inputs and outputs, one entry per operation: a data list.
  /^packages\/core\/src\/operation-io\.ts$/,
];

const TEST = /(\.test\.|\.spec\.|\/tests\/|\/e2e\/|\/__tests__\/|\/testing\/|jest\.setup)/;
const CODE = /\.(ts|tsx|mjs|js)$/;

export const isTest = (path) => TEST.test(path);
export const isSource = (path) => CODE.test(path) && !isTest(path) && !EXEMPT.some((e) => e.test(path));

/** A file's length as an editor counts it: a final newline doesn't add a line. */
export function lineCount(text) {
  if (text === "") return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

const isFunction = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node);

const NESTS = (node) =>
  ts.isIfStatement(node) ||
  ts.isForStatement(node) ||
  ts.isForOfStatement(node) ||
  ts.isForInStatement(node) ||
  ts.isWhileStatement(node) ||
  ts.isDoStatement(node) ||
  ts.isSwitchStatement(node) ||
  ts.isTryStatement(node);

/** How deep a function's own ifs, loops, switches and tries go (an `else if` adds nothing). */
function nestingOf(fn) {
  let deepest = 0;
  const walk = (node, depth) => {
    if (node !== fn && isFunction(node)) return;
    let here = depth;
    if (NESTS(node)) {
      const elseIf = ts.isIfStatement(node) && ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
      if (!elseIf) here = depth + 1;
      deepest = Math.max(deepest, here);
    }
    ts.forEachChild(node, (child) => walk(child, here));
  };
  walk(fn, 0);
  return deepest;
}

/**
 * Every named function with a body in a file: its name, lines, nesting and
 * parameter count. A function with no name of its own takes the name it is
 * assigned to; one with neither (a callback) is measured under `(anon)`.
 */
export function functionsIn(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const out = [];
  const visit = (node) => {
    if (isFunction(node) && node.body && ts.isBlock(node.body)) {
      const start = source.getLineAndCharacterOfPosition(node.getStart()).line;
      const end = source.getLineAndCharacterOfPosition(node.end).line;
      const name = node.name?.getText() ?? node.parent?.name?.getText?.() ?? "(anon)";
      out.push({
        name,
        lines: end - start + 1,
        component: path.endsWith(".tsx") && /^[A-Z]/.test(name),
        nesting: nestingOf(node),
        parameters: node.parameters.length,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** The files a source file imports for their values (a type-only import is gone once compiled). */
export function importsOf(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  const out = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      const allTypes =
        clause && !clause.name && named && ts.isNamedImports(named) && named.elements.length > 0 &&
        named.elements.every((element) => element.isTypeOnly);
      if (allTypes) continue;
      out.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      out.push(statement.moduleSpecifier.text);
    }
  }
  return out;
}

/** Where `@/…` points in each app (their tsconfig `paths`). */
const ALIASES = [
  ["apps/client/", "apps/client/src/"],
  ["apps/api/", "apps/api/"],
];

/** The repo file an import names, or null for a package or something not ours. */
export function resolveImport(from, specifier, files) {
  let base;
  if (specifier.startsWith(".")) base = posix.join(posix.dirname(from), specifier);
  else if (specifier.startsWith("@/")) {
    const alias = ALIASES.find(([app]) => from.startsWith(app));
    if (!alias) return null;
    base = alias[1] + specifier.slice(2);
  } else return null;
  // A platform file (`x.web.ts`, `x.ios.ts`) stands in for `x` on that platform.
  const tries = [
    base,
    ...[".ts", ".tsx", ".mjs", ".js"].map((ext) => base + ext),
    ...[".web.ts", ".web.tsx", ".native.ts", ".native.tsx"].map((ext) => base + ext),
    ...["/index.ts", "/index.tsx"].map((ext) => base + ext),
  ];
  return tries.find((candidate) => files.has(candidate)) ?? null;
}

/** Groups of files that import each other in a circle (Tarjan's strongly connected components). */
export function cycles(graph) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const groups = [];
  const visit = (start) => {
    // Iterative, so a long chain of imports can't overflow the stack.
    const work = [[start, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, at] = frame;
      if (at === 0) {
        index.set(node, counter);
        low.set(node, counter);
        counter += 1;
        stack.push(node);
        onStack.add(node);
      }
      const next = graph.get(node) ?? [];
      if (at < next.length) {
        frame[1] += 1;
        const to = next[at];
        if (!index.has(to)) work.push([to, 0]);
        else if (onStack.has(to)) low.set(node, Math.min(low.get(node), index.get(to)));
        continue;
      }
      if (low.get(node) === index.get(node)) {
        const group = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          group.push(member);
        } while (member !== node);
        if (group.length > 1) groups.push(group.sort());
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent[0], Math.min(low.get(parent[0]), low.get(node)));
    }
  };
  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return groups.map((group) => group.join(" > ")).sort();
}

/** How many times a test file reads the real clock (rule 11). */
export function clockReads(text) {
  let count = 0;
  for (const line of text.split("\n")) {
    if (/^\s*(\/\/|\*)/.test(line)) continue;
    count += (line.match(/new Date\(\)|Date\.now\(\)/g) ?? []).length;
  }
  return count;
}

/**
 * Everything that breaks a rule today, as the exceptions file lists it.
 * `files` maps each repo path to its text.
 */
export function measure(files) {
  const found = { files: {}, functions: {}, nesting: {}, parameters: {}, cycles: [], clock: {} };
  const paths = [...files.keys()].sort();
  const sources = new Set(paths.filter(isSource));
  const graph = new Map();

  const worst = (bucket, key, value) => {
    bucket[key] = Math.max(bucket[key] ?? 0, value);
  };

  for (const path of paths) {
    const text = files.get(path);
    if (CODE.test(path) && isTest(path)) {
      const reads = clockReads(text);
      if (reads > 0) found.clock[path] = reads;
      continue;
    }
    if (!sources.has(path)) continue;

    const lines = lineCount(text);
    if (lines > LIMITS.fileLines) found.files[path] = lines;

    for (const fn of functionsIn(path, text)) {
      const key = `${path}#${fn.name}`;
      if (fn.lines > (fn.component ? LIMITS.componentLines : LIMITS.functionLines)) worst(found.functions, key, fn.lines);
      if (fn.nesting > LIMITS.nesting) worst(found.nesting, key, fn.nesting);
      if (fn.parameters > LIMITS.parameters && fn.name !== "(anon)") worst(found.parameters, key, fn.parameters);
    }

    graph.set(
      path,
      importsOf(path, text)
        .map((specifier) => resolveImport(path, specifier, sources))
        .filter((to) => to && to !== path),
    );
  }
  found.cycles = cycles(graph);
  return found;
}

/**
 * What knip's JSON report calls unused or unlisted, one line each:
 * `<file>: <kind> <name>` (rules 2 and 8).
 */
export function unusedFrom(report) {
  const KINDS = [
    ["files", "unused file"],
    ["exports", "unused export"],
    ["types", "unused type"],
    ["dependencies", "unused package"],
    ["devDependencies", "unused package"],
    ["unlisted", "package not listed here"],
    ["unresolved", "import that leads nowhere"],
  ];
  const out = [];
  for (const issue of report.issues ?? []) {
    for (const [field, kind] of KINDS) {
      for (const item of issue[field] ?? []) out.push(`${issue.file}: ${kind} ${item.name}`);
    }
  }
  return [...new Set(out)].sort();
}

/** jscpd's copies as `<file> = <file>` and the most lines any copy between the two shares (rule 1). */
export function repeatsFrom(report) {
  const out = {};
  for (const copy of report.duplicates ?? []) {
    const pair = [copy.firstFile.name, copy.secondFile.name].sort().join(" = ");
    out[pair] = Math.max(out[pair] ?? 0, copy.lines);
  }
  return out;
}

const SIZED = [
  ["files", "is over 500 lines", "lines"],
  ["functions", "is a function over the limit (60 lines, a screen component 150)", "lines"],
  ["nesting", "nests deeper than 4 levels", "levels"],
  ["parameters", "takes more than 3 arguments", "arguments"],
  ["clock", "is a test that reads the real clock", "reads"],
  ["repeats", "repeat the same code", "lines"],
];

const NAMED = [
  ["cycles", "these files import each other in a circle"],
  ["unused", "dead or unlisted"],
];

/**
 * What stops the check: new breaks, listed breaks that got worse, and listed
 * breaks that are gone. Empty when the repo matches its list.
 */
export function problems(found, allowed) {
  const out = [];
  for (const [kind, says, unit] of SIZED) {
    const now = found[kind] ?? {};
    const listed = allowed[kind] ?? {};
    for (const [key, value] of Object.entries(now)) {
      if (!(key in listed)) out.push(`New: ${key} ${says} (${value} ${unit}).`);
      else if (value > listed[key]) out.push(`Worse: ${key} ${says}, and grew from ${listed[key]} to ${value} ${unit}.`);
    }
    for (const key of Object.keys(listed)) {
      if (!(key in now)) out.push(`Fixed: ${key} no longer breaks the rule. Take it off the list (--update).`);
    }
  }
  for (const [kind, says] of NAMED) {
    const listed = new Set(allowed[kind] ?? []);
    const now = new Set(found[kind] ?? []);
    for (const item of now) if (!listed.has(item)) out.push(`New: ${says}: ${item}.`);
    for (const item of listed) if (!now.has(item)) out.push(`Fixed: no longer ${says}: ${item}. Take it off the list (--update).`);
  }
  return out;
}

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** The exceptions file's text for what was found. */
export function listing(found) {
  return (
    JSON.stringify(
      {
        files: sorted(found.files),
        functions: sorted(found.functions),
        nesting: sorted(found.nesting),
        parameters: sorted(found.parameters),
        cycles: found.cycles,
        clock: sorted(found.clock),
        unused: found.unused ?? [],
        repeats: sorted(found.repeats ?? {}),
      },
      null,
      2,
    ) + "\n"
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const LIST = join(here, "code-standards-exceptions.json");

/** Source only: a test may say the same thing twice to stay readable on its own. */
const REPEAT_IGNORE =
  "**/node_modules/**,**/db-types.ts,**/generated/**,**/*.test.*,**/*.spec.*,**/tests/**,**/e2e/**,**/__tests__/**,**/dist/**,**/.next/**";

const bin = (root, name) => join(root, "node_modules", ".bin", name);

/** knip, over every workspace (knip.json). */
function runKnip(root) {
  const out = execFileSync(bin(root, "knip"), ["--no-exit-code", "--no-progress", "--reporter", "json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64e6,
  });
  return JSON.parse(out);
}

/** jscpd: the same 8 lines (70 tokens) or more, twice. */
function runJscpd(root) {
  const dir = mkdtempSync(join(tmpdir(), "jscpd-"));
  try {
    execFileSync(
      bin(root, "jscpd"),
      ["apps", "packages", "scripts", "--min-lines", "8", "--min-tokens", "70", "--format", "typescript,tsx,javascript",
        "--ignore", REPEAT_IGNORE, "--reporters", "json", "--output", dir, "--silent"],
      { cwd: root, encoding: "utf8", maxBuffer: 64e6 },
    );
    return JSON.parse(readFileSync(join(dir, "jscpd-report.json"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(args) {
  const root = resolve(here, "../..");
  const tracked = execFileSync("git", ["ls-files", "apps", "packages", "scripts"], { cwd: root, encoding: "utf8", maxBuffer: 64e6 })
    .split("\n")
    .filter((path) => CODE.test(path) && existsSync(join(root, path)));
  const files = new Map(tracked.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  const found = measure(files);
  found.unused = unusedFrom(runKnip(root));
  found.repeats = repeatsFrom(runJscpd(root));

  if (args.includes("--update")) {
    writeFileSync(LIST, listing(found));
    console.log(`Wrote ${LIST}.`);
    return 0;
  }

  const allowed = JSON.parse(readFileSync(LIST, "utf8"));
  const wrong = problems(found, allowed);
  const count = (kind) => (Array.isArray(found[kind]) ? found[kind].length : Object.keys(found[kind]).length);
  console.log(
    `Code standards: ${count("files")} long files, ${count("functions")} long functions, ${count("nesting")} deep, ` +
      `${count("parameters")} with many arguments, ${count("cycles")} import circles, ${count("clock")} tests on the real clock, ` +
      `${count("unused")} dead or unlisted, ${count("repeats")} repeats (all listed).`,
  );
  if (wrong.length === 0) return 0;
  console.error(`\n${wrong.length} thing${wrong.length === 1 ? "" : "s"} to put right (docs/standards/code.md):\n`);
  for (const line of wrong) console.error(`  ${line}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

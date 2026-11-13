import { describe, expect, it } from "vitest";

import {
  clockReads,
  cycles,
  functionsIn,
  importsOf,
  isSource,
  isTest,
  lineCount,
  listing,
  measure,
  problems,
  repeatsFrom,
  resolveImport,
  unusedFrom,
} from "./code-standards.mjs";

const lines = (n: number, line = "const a = 1;") => Array.from({ length: n }, () => line).join("\n") + "\n";
const fn = (name: string, body: number) => `function ${name}() {\n${lines(body, "  step();")}}\n`;

describe("lineCount", () => {
  it("counts as an editor does", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("a")).toBe(1);
    expect(lineCount("a\n")).toBe(1);
    expect(lineCount("a\nb")).toBe(2);
    expect(lineCount("a\n\n")).toBe(2);
  });
});

describe("which files count", () => {
  it("leaves tests, generated files and data lists out of the size rules", () => {
    expect(isSource("packages/core/src/deal.ts")).toBe(true);
    expect(isSource("apps/client/src/app/today.tsx")).toBe(true);
    expect(isSource("packages/core/src/deal.test.ts")).toBe(false);
    expect(isSource("apps/api/e2e/auth.ts")).toBe(false);
    expect(isSource("packages/core/src/db-types.ts")).toBe(false);
    expect(isSource("packages/core/generated/operations.json")).toBe(false);
    expect(isSource("packages/core/src/operation-io.ts")).toBe(false);
    expect(isSource("README.md")).toBe(false);
    expect(isTest("apps/client/src/__tests__/app/today.test.tsx")).toBe(true);
    expect(isTest("apps/api/lib/engine/tick.ts")).toBe(false);
  });
});

describe("functionsIn", () => {
  it("measures a function's lines, arguments and name", () => {
    const [one] = functionsIn("a.ts", "export function add(a: number, b: number) {\n  return a + b;\n}\n");
    expect(one).toMatchObject({ name: "add", lines: 3, parameters: 2, nesting: 0, component: false });
  });

  it("names an arrow function after what it is assigned to", () => {
    const [one] = functionsIn("a.ts", "const double = (n: number) => {\n  return n * 2;\n};\n");
    expect(one.name).toBe("double");
  });

  it("skips an arrow with no block: there is nothing to grow", () => {
    expect(functionsIn("a.ts", "const double = (n: number) => n * 2;\n")).toEqual([]);
  });

  it("calls a capitalised function in a .tsx file a component", () => {
    const text = "export function Row() {\n  return null;\n}\n";
    expect(functionsIn("row.tsx", text)[0].component).toBe(true);
    expect(functionsIn("row.ts", text)[0].component).toBe(false);
  });

  it("counts nesting by ifs, loops, switches and tries, and not by else if", () => {
    const text = `function f(x: number) {
  if (x) {
    for (const a of [1]) {
      while (x) {
        try {
          if (a) x = 0;
        } catch {}
      }
    }
  } else if (x === 2) {
    x = 3;
  }
}
`;
    expect(functionsIn("a.ts", text)[0].nesting).toBe(5);
  });

  it("does not count an inner function's nesting against the outer one", () => {
    const text = "function outer() {\n  if (a) {\n    const inner = () => {\n      if (b) {\n        if (c) go();\n      }\n    };\n  }\n}\n";
    const [outer, inner] = functionsIn("a.ts", text);
    expect(outer.nesting).toBe(1);
    expect(inner.nesting).toBe(2);
  });
});

describe("importsOf", () => {
  it("lists value imports and re-exports, and leaves type-only ones out", () => {
    const text = [
      'import { a } from "./a";',
      'import type { B } from "./b";',
      'import { type C } from "./c";',
      'import { type D, d } from "./d";',
      'import e from "./e";',
      'export { f } from "./f";',
      'export type { G } from "./g";',
      'import "./h";',
    ].join("\n");
    expect(importsOf("x.ts", text)).toEqual(["./a", "./d", "./e", "./f", "./h"]);
  });
});

describe("resolveImport", () => {
  const files = new Set([
    "packages/core/src/week.ts",
    "apps/client/src/api/auth.ts",
    "apps/client/src/api/google.web.ts",
    "apps/client/src/components/john-sheet/index.tsx",
    "apps/api/lib/respond.ts",
  ]);

  it("follows relative paths, each app's @/ and index files", () => {
    expect(resolveImport("packages/core/src/deal.ts", "./week", files)).toBe("packages/core/src/week.ts");
    expect(resolveImport("apps/client/src/app/today.tsx", "@/api/auth", files)).toBe("apps/client/src/api/auth.ts");
    expect(resolveImport("apps/client/src/app/today.tsx", "@/components/john-sheet", files)).toBe(
      "apps/client/src/components/john-sheet/index.tsx",
    );
    expect(resolveImport("apps/api/app/api/deal/route.ts", "@/lib/respond", files)).toBe("apps/api/lib/respond.ts");
  });

  it("takes a platform file for the plain name", () => {
    expect(resolveImport("apps/client/src/api/auth.ts", "./google", files)).toBe("apps/client/src/api/google.web.ts");
  });

  it("answers null for a package or a file that isn't there", () => {
    expect(resolveImport("packages/core/src/deal.ts", "zod", files)).toBeNull();
    expect(resolveImport("packages/core/src/deal.ts", "./gone", files)).toBeNull();
    expect(resolveImport("scripts/tick.mjs", "@/lib/respond", files)).toBeNull();
  });
});

describe("cycles", () => {
  it("finds no circle in a tree", () => {
    expect(cycles(new Map([["a", ["b", "c"]], ["b", ["c"]], ["c", []]]))).toEqual([]);
  });

  it("names every file in a circle once, sorted", () => {
    const graph = new Map([["c", ["a"]], ["a", ["b"]], ["b", ["c"]], ["d", ["a"]]]);
    expect(cycles(graph)).toEqual(["a > b > c"]);
  });

  it("keeps two circles apart", () => {
    const graph = new Map([["a", ["b"]], ["b", ["a"]], ["x", ["y"]], ["y", ["x"]]]);
    expect(cycles(graph)).toEqual(["a > b", "x > y"]);
  });

  it("handles a very long chain", () => {
    const graph = new Map<string, string[]>();
    for (let i = 0; i < 20_000; i += 1) graph.set(`f${i}`, i < 19_999 ? [`f${i + 1}`] : []);
    expect(cycles(graph)).toEqual([]);
  });
});

// Spelled in two halves, so this file doesn't read as one that asks the clock itself.
const NEW_DATE = "new " + "Date()";
const DATE_NOW = "Date." + "now()";

describe("clockReads", () => {
  it("counts each read of the real clock, not comments or a given time", () => {
    const text = [
      `const now = ${NEW_DATE};`,
      `const later = new Date(${DATE_NOW} + 1000);`,
      `// ${NEW_DATE} in a comment`,
      ` * ${DATE_NOW} in a doc comment`,
      'const fixed = new Date("2026-11-02T10:00:00Z");',
    ].join("\n");
    expect(clockReads(text)).toBe(2);
  });
});

describe("measure", () => {
  it("lists what is over each limit and nothing else", () => {
    const files = new Map([
      ["packages/core/src/long.ts", lines(501)],
      ["packages/core/src/edge.ts", lines(500)],
      ["packages/core/src/fns.ts", fn("short", 58) + fn("long", 59) + "function many(a: 1, b: 2, c: 3, d: 4) {\n  go();\n}\n"],
      ["apps/client/src/components/row.tsx", fn("Row", 148) + fn("Big", 149) + fn("helper", 59)],
      ["packages/core/src/long.test.ts", lines(900) + `const now = ${NEW_DATE};\n`],
      ["packages/core/src/db-types.ts", lines(5000)],
    ]);
    expect(measure(files)).toEqual({
      files: { "packages/core/src/long.ts": 501 },
      functions: {
        "packages/core/src/fns.ts#long": 61,
        "apps/client/src/components/row.tsx#Big": 151,
        "apps/client/src/components/row.tsx#helper": 61,
      },
      nesting: {},
      parameters: { "packages/core/src/fns.ts#many": 4 },
      cycles: [],
      clock: { "packages/core/src/long.test.ts": 1 },
    });
  });

  it("finds a circle of value imports, and not one closed only by a type", () => {
    const files = new Map([
      ["packages/core/src/a.ts", 'import { b } from "./b";\nexport const a = 1;\n'],
      ["packages/core/src/b.ts", 'import { a } from "./a";\nexport const b = 1;\n'],
      ["packages/core/src/c.ts", 'import { d } from "./d";\nexport type C = 1;\n'],
      ["packages/core/src/d.ts", 'import type { C } from "./c";\nexport const d = 1;\n'],
    ]);
    expect(measure(files).cycles).toEqual(["packages/core/src/a.ts > packages/core/src/b.ts"]);
  });
});

describe("the tools' reports", () => {
  it("turns knip's report into one line per dead thing", () => {
    const report = {
      issues: [
        {
          file: "apps/client/src/hooks/use-kind.ts",
          exports: [{ name: "useHouseKind" }],
          types: [{ name: "Kind" }],
          files: [],
          dependencies: [],
        },
        { file: "apps/client/package.json", dependencies: [{ name: "expo-image" }], unlisted: [{ name: "zod" }, { name: "zod" }] },
      ],
    };
    expect(unusedFrom(report)).toEqual([
      "apps/client/package.json: package not listed here zod",
      "apps/client/package.json: unused package expo-image",
      "apps/client/src/hooks/use-kind.ts: unused export useHouseKind",
      "apps/client/src/hooks/use-kind.ts: unused type Kind",
    ]);
    expect(unusedFrom({})).toEqual([]);
  });

  it("keeps the longest copy between each pair of files", () => {
    const copy = (a: string, b: string, n: number) => ({ firstFile: { name: a }, secondFile: { name: b }, lines: n });
    expect(repeatsFrom({ duplicates: [copy("b.ts", "a.ts", 9), copy("a.ts", "b.ts", 14), copy("a.ts", "a.ts", 10)] })).toEqual({
      "a.ts = b.ts": 14,
      "a.ts = a.ts": 10,
    });
  });
});

describe("problems", () => {
  const found = {
    files: { "a.ts": 600 },
    functions: {},
    nesting: {},
    parameters: {},
    cycles: [],
    clock: {},
    unused: ["a.ts: unused export gone"],
    repeats: {},
  };

  it("passes when the repo matches its list, or a listed break got smaller", () => {
    expect(problems(found, { ...found })).toEqual([]);
    expect(problems(found, { ...found, files: { "a.ts": 700 } })).toEqual([]);
  });

  it("stops a new break", () => {
    expect(problems(found, { ...found, files: {} })).toEqual(["New: a.ts is over 500 lines (600 lines)."]);
    expect(problems(found, { ...found, unused: [] })).toEqual(["New: dead or unlisted: a.ts: unused export gone."]);
  });

  it("stops a listed break that grew", () => {
    expect(problems(found, { ...found, files: { "a.ts": 599 } })).toEqual([
      "Worse: a.ts is over 500 lines, and grew from 599 to 600 lines.",
    ]);
  });

  it("stops a listed break that is fixed, so the list only shrinks", () => {
    expect(problems({ ...found, files: {} }, found)[0]).toMatch(/^Fixed: a\.ts no longer breaks the rule/);
    expect(problems({ ...found, unused: [] }, found)[0]).toMatch(/^Fixed: no longer dead or unlisted: a\.ts/);
  });

  it("reads a list written before a check existed", () => {
    expect(problems({ ...found, files: {}, unused: [] }, {})).toEqual([]);
  });
});

describe("listing", () => {
  it("writes the list sorted, so a change is one line in a diff", () => {
    const text = listing({ files: { "b.ts": 600, "a.ts": 700 }, functions: {}, nesting: {}, parameters: {}, cycles: [], clock: {} });
    expect(Object.keys(JSON.parse(text).files)).toEqual(["a.ts", "b.ts"]);
    expect(text.endsWith("}\n")).toBe(true);
  });
});

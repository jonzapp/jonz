import { describe, expect, it } from "vitest";

import { missingDb, missingE2e, playwrightTests } from "./count-guard.mjs";

const spec = (title: string, project: string, results: unknown[]) => ({
  title,
  file: "a.spec.ts",
  tests: [{ projectName: project, results }],
});

const listed = {
  suites: [
    {
      title: "a.spec.ts",
      file: "a.spec.ts",
      specs: [spec("one", "android-chrome", []), spec("one", "iphone-safari", [])],
      suites: [{ title: "a house", file: "a.spec.ts", specs: [spec("two", "android-chrome", [])] }],
    },
  ],
};

const ran = (project: string, titles: string[], nestedRan = true) => ({
  suites: [
    {
      title: "a.spec.ts",
      file: "a.spec.ts",
      specs: titles.map((t) => spec(t, project, [{ status: "passed" }])),
      suites: [
        { title: "a house", file: "a.spec.ts", specs: [spec("two", project, nestedRan ? [{ status: "skipped" }] : [])] },
      ],
    },
  ],
});

describe("end-to-end count guard", () => {
  it("names each test by device, file and describe path", () => {
    expect(playwrightTests(listed).map((t: { key: string }) => t.key)).toEqual([
      "android-chrome › a.spec.ts › one",
      "iphone-safari › a.spec.ts › one",
      "android-chrome › a.spec.ts › a house › two",
    ]);
  });

  it("passes when every listed test ran somewhere, a skip at run time included", () => {
    const result = missingE2e(listed, [ran("android-chrome", ["one"]), ran("iphone-safari", ["one"])]);
    expect(result.missing).toEqual([]);
    expect(result.expected).toBe(3);
  });

  it("names a device no job ran", () => {
    expect(missingE2e(listed, [ran("android-chrome", ["one"])]).missing).toEqual(["iphone-safari › a.spec.ts › one"]);
  });

  it("names a test that never started (a run stopped early)", () => {
    const result = missingE2e(listed, [ran("android-chrome", ["one"], false), ran("iphone-safari", ["one"])]);
    expect(result.missing).toEqual(["android-chrome › a.spec.ts › a house › two"]);
  });
});

describe("database count guard", () => {
  const root = "/repo";
  const report = (...files: string[]) => ({
    testResults: files.map((f) => ({ name: `${root}/${f}`, assertionResults: [{}, {}] })),
  });
  const existing = ["apps/api/tests/db/a.test.ts", "apps/api/tests/db/b.test.ts", "apps/v1/tests/db/c.test.ts"];

  it("passes when the shards between them ran every file", () => {
    const result = missingDb(
      existing,
      [report("apps/api/tests/db/a.test.ts", "apps/v1/tests/db/c.test.ts"), report("apps/api/tests/db/b.test.ts")],
      root,
    );
    expect(result).toEqual({ expected: 3, ran: 3, tests: 6, missing: [] });
  });

  it("names a file no shard ran", () => {
    expect(missingDb(existing, [report("apps/api/tests/db/a.test.ts")], root).missing).toEqual([
      "apps/api/tests/db/b.test.ts",
      "apps/v1/tests/db/c.test.ts",
    ]);
  });
});

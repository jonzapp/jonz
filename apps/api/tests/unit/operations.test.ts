import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { SYSTEM_ROUTES } from "@app/core";
import { describe, expect, it } from "vitest";

/**
 * Every API route is in the operation registry (packages/core/src/operations.ts)
 * as a system route that says what calls it. A person's operations are all
 * on /v1, so a new /api route that isn't a system one fails here.
 */
const APP = join(__dirname, "../../app");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : [],
  );
}

function routesOnDisk(): string[] {
  return routeFiles(join(APP, "api")).flatMap((file) => {
    const path = "/" + relative(APP, file).split(sep).slice(0, -1).join("/");
    const source = readFileSync(file, "utf8");
    return METHODS.filter((m) => new RegExp(`export (async )?(function|const) ${m}\\b`).test(source)).map((m) => `${m} ${path}`);
  });
}

/** Every source file of the app, tests aside. */
function appSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? e.name === "node_modules" || e.name === "__tests__"
        ? []
        : appSources(join(dir, e.name))
      : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

describe("the app's own reads and writes", () => {
  it("go through /v1 only: no table or database function straight from the app", () => {
    const files = appSources(join(__dirname, "../../../client/src"));
    expect(files.length).toBeGreaterThan(20);
    const direct = files.flatMap((file) =>
      // A table (not storage's bucket, storage.from(...)) or a database function.
      [...readFileSync(file, "utf8").matchAll(/(?<!storage)\.from\(\s*'([a-z_]+)'|\.rpc\(\s*'([a-z_]+)'/g)].map(
        (m) => `${m[1] ?? m[2]} (${relative(join(__dirname, "../../.."), file)})`,
      ),
    );
    expect(direct).toEqual([]);
  });
});

describe("the API's routes", () => {
  it("are each a system route, and nothing listed is missing: a person's operations are all on /v1", () => {
    expect(routesOnDisk().sort()).toEqual(Object.keys(SYSTEM_ROUTES).sort());
  });
});

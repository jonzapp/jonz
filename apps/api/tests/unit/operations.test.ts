import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { OPERATIONS, OPERATION_NAMES, SYSTEM_ROUTES, type Operation } from "@app/core";
import { describe, expect, it } from "vitest";

/**
 * Every API route is in the operation registry (packages/core/src/operations.ts):
 * as the route in front of an operation, or as a system route that says
 * what calls it. A new route that's neither fails here.
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
  it("only touch tables an operation names, so each has its contract in the registry", () => {
    const named = new Set(
      OPERATION_NAMES.flatMap((n) => {
        const o: Operation = OPERATIONS[n];
        return o.tables ?? [];
      }),
    );
    const used = appSources(join(__dirname, "../../../client/src")).flatMap((file) =>
      // A table, not storage's bucket (storage.from(...)).
      [...readFileSync(file, "utf8").matchAll(/(?<!storage)\.from\(\s*'([a-z_]+)'/g)].map((m) => `${m[1]} (${relative(join(__dirname, "../../.."), file)})`),
    );
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((u) => !named.has(u.split(" ")[0] as never))).toEqual([]);
  });
});

describe("the API's routes", () => {
  it("are each an operation's route or a system route, and nothing listed is missing", () => {
    const listed = [
      ...OPERATION_NAMES.flatMap((n) => {
        const o: Operation = OPERATIONS[n];
        return o.route ? [o.route] : [];
      }),
      ...Object.keys(SYSTEM_ROUTES),
    ].sort();
    expect(routesOnDisk().sort()).toEqual(listed);
  });
});

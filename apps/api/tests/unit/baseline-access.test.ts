import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * What a new table, function or sequence can be used by before anything is
 * granted is Supabase's choice, and it changes from one version to the next:
 * some hand every function to anon and authenticated. So the baseline
 * (supabase/migrations/20270112090000_baseline.sql) takes everything off the
 * three API roles before it grants anything, and clears what later
 * migrations' objects would start with. This fails if that goes missing,
 * whichever Supabase version the tests happen to run on.
 */

const sql = readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20270112090000_baseline.sql", import.meta.url)), "utf8");

const ROLES = '"anon", "authenticated", "service_role"';
const KINDS = ["TABLES", "FUNCTIONS", "SEQUENCES"];
const firstGrant = sql.search(/^GRANT [A-Z, ]+ ON (TABLE|FUNCTION|SEQUENCE) /m);

describe("the baseline states who may use what", () => {
  it("grants by name", () => {
    expect(firstGrant).toBeGreaterThan(0);
  });

  it.each(KINDS)("takes every right on %s off the API roles before the first grant", (kind) => {
    const at = sql.indexOf(`REVOKE ALL ON ALL ${kind} IN SCHEMA "public" FROM ${ROLES};`);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(firstGrant);
  });

  it.each(KINDS)("clears what new %s start with before setting it", (kind) => {
    const defaults = `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"`;
    const cleared = sql.indexOf(`${defaults} REVOKE ALL ON ${kind} FROM ${ROLES};`);
    expect(cleared).toBeGreaterThan(0);
    expect(cleared).toBeLessThan(sql.indexOf(`${defaults} GRANT ALL ON ${kind} TO "postgres";`));
  });

  it("gives new functions and sequences to nobody but their owner", () => {
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES[^;]* ON (FUNCTIONS|SEQUENCES) TO "(anon|authenticated|service_role)"/);
  });

  it("never grants a function or a sequence to anon by accident", () => {
    const toAnon = [...sql.matchAll(/^GRANT [A-Z, ]+ ON (?:FUNCTION|SEQUENCE) "public"\."([a-z_]+)"[^;]* TO "anon";/gm)].map((m) => m[1]);
    expect(toAnon).toEqual(["api_pre_request"]);
  });
});

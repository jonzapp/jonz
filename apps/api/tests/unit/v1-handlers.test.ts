import { Problem } from "@app/server";
import { describe, expect, it } from "vitest";
import { HANDLED, withHandlers } from "v1";

import { passAnswer, refusal, V1_HANDLERS } from "@/lib/v1/handlers";

/**
 * The /v1 operations whose logic lives in apps/api: every one has a handler,
 * and a move's refusal comes back as the Problem a database function's
 * would. Each move itself is tested where it was (tests/db).
 */
describe("/v1 server operations", () => {
  it("has a handler for every operation whose logic is TypeScript", () => {
    expect(Object.keys(V1_HANDLERS).sort()).toEqual([...HANDLED].sort());
    const served = withHandlers(V1_HANDLERS);
    for (const name of HANDLED) expect(served.find((o) => o.name === name)?.handler, name).toBeTypeOf("function");
  });

  it("gives a move's refusal as the database's would", () => {
    expect(refusal({ code: "42501", message: "admins_only" })).toMatchObject({ code: "forbidden" });
    expect(refusal({ code: "P0001", message: "week_started" })).toMatchObject({ code: "rejected", message: "week_started" });
    expect(refusal({ message: "promotion_unknown" })).toMatchObject({ code: "rejected", message: "promotion_unknown" });
  });

  it("gives a Pass answer's status as its Problem", () => {
    expect(passAnswer({ url: "https://checkout.stripe.com/x" })).toEqual({ url: "https://checkout.stripe.com/x" });
    const thrown = (status: number) => {
      try {
        passAnswer({ status, message: "No." });
      } catch (e) {
        return e as Problem;
      }
    };
    expect(thrown(403)).toMatchObject({ code: "forbidden", status: 403, message: "No." });
    expect(thrown(404)).toMatchObject({ code: "not_found" });
    expect(thrown(409)).toMatchObject({ code: "rejected" });
    expect(thrown(503)).toMatchObject({ code: "unavailable", status: 503 });
  });
});

import { describe, expect, it } from "vitest";

import { OPERATION_NAMES } from "./operations";
import { operationsJson, type OperationJson } from "./operations-json";

describe("operations.json", () => {
  it("is the registry as it stands (npx vitest run -u to write it)", async () => {
    await expect(operationsJson()).toMatchFileSnapshot("../generated/operations.json");
  });

  it("holds every operation, each with a route and both schemas", () => {
    const { operations } = JSON.parse(operationsJson()) as { operations: OperationJson[] };
    expect(operations.map((o) => o.name)).toEqual(OPERATION_NAMES);
    for (const o of operations) {
      expect(o.path.startsWith("/v1/"), o.name).toBe(true);
      expect(o.input, o.name).toMatchObject({ type: "object" });
      expect(o.output, o.name).toBeTruthy();
    }
  });
});

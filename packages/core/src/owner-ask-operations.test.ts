import { describe, expect, it } from "vitest";

import { OPERATION_IO } from "./operation-io";
import { OPERATIONS } from "./operations";
import { APP_WRITES, OWNER_ASK_COVERAGE, OWNER_ASK_NOT_MOVES, OWNER_ASK_OPERATIONS, OWNER_MOVE_OPERATION, OWNER_MOVE_PERMISSION, OWNER_WRITE_TOOLS, ownerOperationPermission, ownerToolAbout } from "./owner-ask-operations";
import { OwnerMove, OWNER_PERMISSION_NAMES } from "./owner-moves";

const kinds = OwnerMove.options.map((o) => o.shape.kind.value).sort();

describe("the owner's Ask Jonz, from the registry", () => {
  it("puts every admin write on the card or says why it isn't a move, never both", () => {
    for (const n of APP_WRITES) {
      const where = [n in OWNER_ASK_OPERATIONS, n in OWNER_ASK_NOT_MOVES].filter(Boolean);
      expect(where, n).toHaveLength(1);
    }
  });

  it("makes every card move through one admin write, which asks for the move's permission", () => {
    expect(Object.keys(OWNER_MOVE_OPERATION).sort()).toEqual(kinds);
    for (const [kind, op] of Object.entries(OWNER_MOVE_OPERATION)) {
      expect(OPERATIONS[op].scope, kind).toBe("app");
      expect(OWNER_MOVE_PERMISSION[kind as never], kind).toBe(ownerOperationPermission(op));
    }
  });

  it("gives every write permission at least one tool, and every tool its operation's words", () => {
    expect(Object.keys(OWNER_ASK_COVERAGE).sort()).toEqual([...OWNER_PERMISSION_NAMES].sort());
    for (const [perm, c] of Object.entries(OWNER_ASK_COVERAGE)) {
      if (perm.endsWith(":read")) expect(c, perm).toEqual({ by: "reads" });
      else expect(c.by === "card" && c.tools.length > 0, perm).toBe(true);
    }
    for (const tool of OWNER_WRITE_TOOLS) expect(ownerToolAbout(tool), tool).not.toBe("");
    // One tool per move.
    expect(new Set(Object.values(OWNER_ASK_OPERATIONS).map((c) => c.tool)).size).toBe(Object.keys(OWNER_ASK_OPERATIONS).length);
  });

  it("has every card operation's contract", () => {
    for (const op of Object.keys(OWNER_ASK_OPERATIONS)) expect(OPERATION_IO[op as keyof typeof OPERATION_IO].http, op).toMatch(/\/v1\/admin\//);
  });
});

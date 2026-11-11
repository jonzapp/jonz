import { describe, expect, it } from "vitest";

import { moveIsDangerous, type ChatMove } from "./chat-moves";
import { OPERATION_NAMES, OPERATIONS, isDangerous } from "./operations";
import { OWNER_MOVE_OPERATION, ownerMoveIsDangerous } from "./owner-ask-operations";
import { OwnerMove } from "./owner-moves";

// What goes in a Danger zone is read from the registry's `destructive`, the
// same flag that holds a move for approval over /v1 and MCP, so the app, the
// API and Ask Jonz's cards never disagree about which moves can't be undone.

describe("isDangerous", () => {
  it("is the registry's destructive flag, for every operation", () => {
    for (const n of OPERATION_NAMES) expect(isDangerous(n), n).toBe((OPERATIONS[n] as { destructive?: true }).destructive === true);
  });

  it("names the resets and deletes, and not everyday moves", () => {
    expect(isDangerous("reset_house_data")).toBe(true);
    expect(isDangerous("owner_reset_house_data")).toBe(true);
    expect(isDangerous("owner_delete_house")).toBe(true);
    expect(isDangerous("mark_done")).toBe(false);
    expect(isDangerous("raise_flag")).toBe(false);
  });
});

describe("moveIsDangerous", () => {
  const op = (operation: string): ChatMove => ({ kind: "operation", operation, input: {}, title: "t", meta: "m" }) as ChatMove;

  it("follows the move's operation", () => {
    expect(moveIsDangerous(op("reset_house_data"))).toBe(true);
    expect(moveIsDangerous(op("raise_flag"))).toBe(false);
  });

  it("never marks time away, which can always be cancelled", () => {
    expect(moveIsDangerous({ kind: "away", from: "2026-11-20", to: "2026-11-23" })).toBe(false);
    expect(moveIsDangerous({ kind: "cancel_away", awayId: "55555555-5555-4555-8555-555555555555", from: "2026-11-20", to: "2026-11-23" })).toBe(false);
  });
});

describe("ownerMoveIsDangerous", () => {
  it("is the flag of the operation each owner move makes", () => {
    for (const kind of OwnerMove.options.map((o) => o.shape.kind.value)) {
      expect(ownerMoveIsDangerous(kind), kind).toBe(isDangerous(OWNER_MOVE_OPERATION[kind]));
    }
  });

  it("marks resetting and deleting a house, and not stopping a deletion", () => {
    expect(ownerMoveIsDangerous("house_reset")).toBe(true);
    expect(ownerMoveIsDangerous("house_delete")).toBe(true);
    expect(ownerMoveIsDangerous("deletion_stop")).toBe(false);
  });
});

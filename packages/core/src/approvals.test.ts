import { describe, expect, it } from "vitest";

import { approvalAsk, approvalDetails, approvalState, APPROVE_PATH, approvePath, consentPath, type ApprovalRow } from "./approvals";
import { signInReason } from "./auth-paths";
import { afterSignIn, googleReturn } from "./front-door";
import { OPERATIONS } from "./operations";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const row: ApprovalRow = {
  id: ID,
  operation: "set_house_kind",
  input: { houseId: "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", kind: "family" },
  house_id: "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  house_name: "Flat 3",
  created_at: "2027-01-04T09:30:00Z",
  expires_at: "2027-01-04T09:45:00Z",
  approved_at: null,
  declined_at: null,
  used_at: null,
};
const at = (time: string) => new Date(`2027-01-04T${time}Z`);

describe("approving a connected app's request", () => {
  it("says where it stands, by the clock it's given", () => {
    expect(approvalState(row, at("09:35:00"))).toBe("waiting");
    expect(approvalState(row, at("09:45:00"))).toBe("expired");
    expect(approvalState({ ...row, approved_at: "2027-01-04T09:31:00Z" }, at("09:35:00"))).toBe("approved");
    expect(approvalState({ ...row, approved_at: "2027-01-04T09:31:00Z", used_at: "2027-01-04T09:32:00Z" }, at("09:50:00"))).toBe("done");
    expect(approvalState({ ...row, declined_at: "2027-01-04T09:31:00Z" }, at("09:35:00"))).toBe("declined");
  });

  it("says what it does in the registry's words, and its details but not its ids", () => {
    expect(approvalAsk(row)).toBe(OPERATIONS.set_house_kind.about);
    expect(approvalAsk({ ...row, operation: "no_such_thing" })).toBe("no such thing");
    expect(approvalDetails(row)).toEqual([{ label: "Kind", value: "family" }]);
  });

  it("brings sign-in back to the request, from Google too", () => {
    const path = approvePath(ID);
    expect(APPROVE_PATH.test(path)).toBe(true);
    expect(APPROVE_PATH.test("/approve/../admin")).toBe(false);
    expect(afterSignIn(path)).toBe(path);
    expect(googleReturn(path)).toBe(path);
    expect(signInReason(path)).toBe(words('people.approve.signInReason'));
  });

  it("brings sign-in back to a connected app's consent page, from Google too, and nowhere it shouldn't", () => {
    const path = consentPath("abc_123-XYZ");
    expect(path).toBe("/oauth/consent?authorization_id=abc_123-XYZ");
    expect(afterSignIn(path)).toBe(path);
    expect(googleReturn(path)).toBe(path);
    expect(signInReason(path)).toBe(words('people.consent.signInReason'));
    expect(afterSignIn("/oauth/consent?authorization_id=x&next=//evil.example")).toBeUndefined();
  });
});

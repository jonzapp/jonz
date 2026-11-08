import type { Permission } from "./permissions";

// Who may do what, written out cell by cell: the answer key the permission
// tests check every check against (packages/core unit tests, and the
// database tests that ask can() as real people). It's a Record over every
// permission, so a new permission doesn't compile until someone decides,
// here, who gets it. Change it only on purpose: a change here is a change
// in who can do what.
//
// Columns are the house roles (a Parent is an admin, a Kid a member);
// someone outside the house may do none of these.

/** Whether a house member and a house admin may do each permission. */
export const HOUSE_MATRIX: Record<Permission, { member: boolean; admin: boolean }> = {
  "house:read": { member: true, admin: true },
  "ticks:write_own": { member: true, admin: true },
  "away:write_own": { member: true, admin: true },
  "swaps:write_own": { member: true, admin: true },
  "flags:write_own": { member: true, admin: true },
  "disputes:write_own": { member: true, admin: true },
  "wall:write_own": { member: true, admin: true },
  "perks:write_own": { member: true, admin: true },
  "profile:write_own": { member: true, admin: true },
  "members:write_own": { member: true, admin: true },
  "house:write": { member: false, admin: true },
  "johns:write": { member: false, admin: true },
  "groups:write": { member: false, admin: true },
  "weeks:write": { member: false, admin: true },
  "history:write": { member: false, admin: true },
  "flags:write": { member: false, admin: true },
  "ticks:write": { member: false, admin: true },
  "pocket_money:write": { member: false, admin: true },
  "members:write": { member: false, admin: true },
};

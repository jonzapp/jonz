// Who can do what in a house: one list for the database, the API, the app
// and Ask Jonz. The database holds the same list in `role_permissions`
// (supabase/migrations/20261118090000_permissions.sql) and enforces it with
// `public.can(house, permission)`; a database test checks the two lists
// match, so change both together. Roles are per house: an admin (a Parent
// in a family) and a member (a Kid in a family). The app's owners are a
// separate thing, checked by `is_owner()`.

/** A house role, as `members.role` holds it. */
export const HOUSE_ROLES = ["admin", "member"] as const;
export type HouseRole = (typeof HOUSE_ROLES)[number];

/**
 * Every permission, with what it lets someone do in plain words (Ask Jonz
 * reads these). The first group is everyone's; the rest are an admin's.
 */
export const PERMISSIONS = {
  // Everyone in the house.
  "house.read": "See the house: its Johns, the week, the Wall, history, balances, time away and people",
  "ticks.own": "Tick off your own Johns, and take a tick back",
  "away.book": "Book and cancel your own time away",
  "swaps.ask": "Ask someone to swap a John, and answer a swap ask",
  "covers.take": "Cover someone else's overdue John",
  "flags.raise": "Flag an on-call John, and take back your own flag",
  "disputes.raise": "Question a tick, and vote on one",
  "wall.react": "React on the Wall",
  "perks.use": "Use an immunity or a swap token",
  "self.edit": "Change your own name, photo, notification settings and preferences",
  "house.leave": "Leave the house",
  // Admins (Parents in a family).
  "house.settings": "Change the house's name and rules",
  "johns.add": "Add Johns to the list",
  "johns.edit": "Change a John on the list",
  "johns.remove": "Take a John off the list",
  "groups.edit": "Make, change and delete groups",
  "week.deal": "Deal the week",
  "history.reset": "Put a result, a week or a month's forfeits right",
  "history.undo_any": "Undo anyone's move from History",
  "flags.remove_any": "Remove anyone's flag",
  "ticks.ok": "OK a kid's tick, or send it back",
  "pocket.pay": "Mark pocket money paid",
  "people.remove": "Remove someone from the house",
  "people.roles": "Make someone an admin, or hand admin over",
  "people.kids": "Add a child without a sign-in, and act for them",
  "invite.reset": "Make a new join code",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

const EVERYONE: Permission[] = [
  "house.read",
  "ticks.own",
  "away.book",
  "swaps.ask",
  "covers.take",
  "flags.raise",
  "disputes.raise",
  "wall.react",
  "perks.use",
  "self.edit",
  "house.leave",
];

/** What each role may do. An admin may do everything a member may. */
export const ROLE_PERMISSIONS: Record<HouseRole, readonly Permission[]> = {
  member: EVERYONE,
  admin: PERMISSION_NAMES,
};

/** Whether someone with this role (or no role: not in the house) may do it. */
export function can(role: HouseRole | null | undefined, permission: Permission): boolean {
  return role != null && ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether this member of the house (or nobody) may do it: the shape the app's views hold. */
export function memberCan(member: { role: HouseRole } | null | undefined, permission: Permission): boolean {
  return can(member?.role, permission);
}

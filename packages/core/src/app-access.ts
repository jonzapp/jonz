// What a connected app may do in Jonz (docs/specs/operation-registry.md,
// "MCP"): the person picks it on the consent page and can change it under
// Connected apps. Read only lets the app run read operations alone; read and
// change lets it do what the person can, with anything that can't be undone
// still waiting for their approval. The executor checks it on every call
// from an app (supabase/migrations/*_connected_apps.sql).

export const APP_ACCESS = ["read", "write"] as const;
export type AppAccess = (typeof APP_ACCESS)[number];

/** What an app gets until the person picks: the safer one. */
export const DEFAULT_APP_ACCESS: AppAccess = "read";

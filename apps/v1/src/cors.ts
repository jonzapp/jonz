// CORS for /v1, by the same rules as apps/api's /api (lib/cors.ts): only a
// browser on another origin needs it, and only listed origins get it. An
// entry is an exact origin or one with `*` for a single DNS label.

function originAllowed(origin: string | null | undefined, allowed: readonly string[]): origin is string {
  if (!origin) return false;
  return allowed.some((entry) => {
    if (!entry.includes("*")) return entry === origin;
    const pattern = entry
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[a-z0-9-]+");
    return new RegExp(`^${pattern}$`).test(origin);
  });
}

export function corsHeaders(origin: string | null | undefined, allowed: readonly string[]): Record<string, string> {
  if (!originAllowed(origin, allowed)) return allowed.length > 0 ? { Vary: "Origin" } : {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, Jonz-Client, Request-Id",
    "Access-Control-Expose-Headers": "Request-Id, Retry-After, Idempotent-Replayed, Deprecation, Sunset, Link, Jonz-Minimum-Build",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

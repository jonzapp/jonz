// CORS, one rule for every server: only a browser on another origin needs
// it (the iOS and Android apps send no Origin header at all), and only
// listed origins get it.

/** What one surface lets a browser on another origin send and read. */
export type CorsRules = { methods: string; headers: string; expose?: string };

/**
 * Whether a web origin may call from elsewhere. An entry is an exact
 * origin, or one with `*` standing for a single DNS label (letters, digits
 * and hyphens), so `https://*-glynfincks-projects.vercel.app` lets in every
 * preview of the web build on staging and nothing on another host.
 */
export function originAllowed(origin: string | null | undefined, allowed: readonly string[]): origin is string {
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

/**
 * The CORS headers for an answer. `Vary: Origin` goes on every answer once
 * any origin is allowed, let in or not: a cached answer (the notices are
 * kept at the edge) must never be one made without the CORS headers and
 * then handed to an allowed browser.
 */
export function corsFor(origin: string | null | undefined, allowed: readonly string[], rules: CorsRules): Record<string, string> {
  if (!originAllowed(origin, allowed)) return allowed.length > 0 ? { Vary: "Origin" } : {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": rules.methods,
    "Access-Control-Allow-Headers": rules.headers,
    ...(rules.expose ? { "Access-Control-Expose-Headers": rules.expose } : {}),
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

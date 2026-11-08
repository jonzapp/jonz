// Only a browser on another origin needs CORS: the iOS and Android apps send
// no Origin header at all.

/**
 * Whether a web origin may call /api/* from elsewhere. An entry is an exact
 * origin, or one with `*` standing for a single DNS label (letters, digits
 * and hyphens), so `https://*-glynfincks-projects.vercel.app` lets in every
 * preview of the web build on staging and nothing on another host.
 */
export function originAllowed(origin: string | null, allowedOrigins: string[]): origin is string {
  if (!origin) return false;
  return allowedOrigins.some((entry) => {
    if (!entry.includes("*")) return entry === origin;
    const pattern = entry
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[a-z0-9-]+");
    return new RegExp(`^${pattern}$`).test(origin);
  });
}

/**
 * `Vary: Origin` goes on every answer once any origin is allowed, let in or
 * not: a cached answer (the notices are kept at the edge) must never be one
 * made without the CORS headers and then handed to an allowed browser.
 */
export function corsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  if (!originAllowed(origin, allowedOrigins)) return allowedOrigins.length > 0 ? { Vary: "Origin" } : {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

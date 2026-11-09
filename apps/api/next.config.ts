import type { NextConfig } from "next";

/**
 * Headers every response gets. The CSP carries only `frame-ancestors`: the
 * app serves JSON, so there is no script to write a policy for.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

/** The site. Everything here that is not the API belongs to it. */
const SITE = "https://jonz.app";

/** Any other path outside `/api`, `/v1`, `/files`, `/auth/v1`, `/mcp` and `/.well-known` (MCP sign-in metadata) (the bare origin has its own rule). */
const NOT_API = "/:path((?!(?:api|v1|files|auth/v1|mcp|\\.well-known)(?:/|$)).*)";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // /v1 (apps/v1) runs on Node as it is: Fastify and the Postgres driver aren't bundled.
  serverExternalPackages: ["fastify", "postgres", "@modelcontextprotocol/server"],
  // The link-preview cards read Overpass off the disk (lib/share/card.tsx).
  outputFileTracingIncludes: { "/api/og/**": ["./assets/fonts/**"] },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // api.jonz.app only serves the API. An old bookmark, a join link from
  // before the Expo app, or someone typing the address lands on the same path
  // on the site (308, so the query string and the method carry over).
  async redirects() {
    return [
      { source: "/", destination: SITE, permanent: true },
      { source: NOT_API, destination: `${SITE}/:path`, permanent: true },
    ];
  },
};

export default nextConfig;

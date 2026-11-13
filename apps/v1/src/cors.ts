import { corsFor } from "@app/core";

/** CORS for /v1, by the one rule every server keeps (@app/core's cors.ts). */
export function corsHeaders(origin: string | null | undefined, allowed: readonly string[]): Record<string, string> {
  return corsFor(origin, allowed, {
    methods: "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    headers: "Authorization, Content-Type, Idempotency-Key, Jonz-Client, Request-Id",
    expose: "Request-Id, Retry-After, Idempotent-Replayed, Deprecation, Sunset, Link, Jonz-Minimum-Build",
  });
}

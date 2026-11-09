// Checks a Supabase Auth access token on this server, with no call to
// Supabase: against the project's published signing keys (JWKS), or with the
// shared secret where a stack still signs with one (the local stack and CI).
// Keys are cached per instance, which is safe to repeat on every instance.

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";

import { Problem } from "./problem";

export interface Claims extends JWTPayload {
  sub: string;
  role: string;
  aal?: string;
  [claim: string]: unknown;
}

export interface TokenConfig {
  /** https://<project>.supabase.co, or the local stack's URL. */
  supabaseUrl: string;
  /** The legacy shared secret, for stacks that still sign with HS256. Tokens signed with the keys are still checked against the JWKS. */
  jwtSecret?: string;
  /** Tests only: the moment to check expiry against. */
  currentDate?: Date;
}

export type TokenVerifier = (authorization: string | null | undefined) => Promise<Claims>;

export function tokenVerifier(config: TokenConfig): TokenVerifier {
  const issuer = `${config.supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const secret = config.jwtSecret ? new TextEncoder().encode(config.jwtSecret) : null;

  return async (authorization) => {
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new Problem("unauthenticated", "Sign in first.");
    try {
      const options = { audience: "authenticated", currentDate: config.currentDate };
      // A stack with the secret may still sign some tokens with its keys (the
      // local stack does both): the token's header says which.
      const { payload } = secret && decodeProtectedHeader(token).alg === "HS256"
        ? await jwtVerify(token, secret, { ...options, algorithms: ["HS256"] })
        : await jwtVerify(token, jwks, { ...options, issuer, algorithms: ["ES256", "RS256"] });
      if (typeof payload.sub !== "string" || payload.role !== "authenticated") throw new Error("not a person's token");
      return payload as Claims;
    } catch {
      throw new Problem("unauthenticated", "Your sign-in has expired. Sign in again.");
    }
  };
}

// Settings, from the environment. Nothing else is read at start, and nothing
// is kept between requests.

import type { MinimumBuilds } from "@app/server";

export interface Config {
  port: number;
  host: string;
  /** postgres://jonz_api.<ref>:<password>@<pooler>:6543/postgres, the transaction pooler. */
  databaseUrl: string;
  supabaseUrl: string;
  /** Only for stacks that still sign tokens with the shared secret (local, CI). */
  jwtSecret?: string;
  origin: string;
  minimumBuilds: MinimumBuilds;
  poolSize: number;
  allowedOrigins: string[];
}

const build = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = ["API_DATABASE_URL", "SUPABASE_URL"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing settings: ${missing.join(", ")}`);
  return {
    port: Number(env.PORT ?? 3206),
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: env.API_DATABASE_URL!,
    supabaseUrl: env.SUPABASE_URL!,
    jwtSecret: env.SUPABASE_JWT_SECRET || undefined,
    origin: env.API_ORIGIN ?? "https://api.jonz.app",
    minimumBuilds: { ios: build(env.MIN_IOS_BUILD), android: build(env.MIN_ANDROID_BUILD) },
    poolSize: Number(env.API_POOL_SIZE ?? 10),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  };
}

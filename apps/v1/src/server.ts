// Starts /v1 on a port. Any number of these can run side by side.

import { connect, createExecutor, tokenVerifier } from "@app/server";

import { buildApp } from "./app";
import { readConfig } from "./config";
import { V1_OPERATIONS } from "./operations";

const config = readConfig();
const sql = connect(config.databaseUrl, config.poolSize);
const execute = createExecutor({
  sql,
  verify: tokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.jwtSecret }),
  operations: V1_OPERATIONS,
  minimumBuilds: config.minimumBuilds,
});
const app = buildApp({ execute, operations: V1_OPERATIONS, origin: config.origin, logger: true });

const stop = async () => {
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

await app.listen({ port: config.port, host: config.host });

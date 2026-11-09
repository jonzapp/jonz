// apps/v1 for the hosts that serve it: apps/api's Next routes (/v1, and /mcp
// through the same executor), and src/server.ts on its own.

export { buildApp, fastifyPath, type AppOptions } from "./app";
export { handleV1, v1Instance } from "./fetch";
export { apiOperation, SERVED, V1_OPERATIONS } from "./operations";

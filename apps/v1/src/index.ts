// apps/v1 for the hosts that serve it: apps/api's Next routes (/v1, and /mcp
// through the same executor), and src/server.ts on its own.

export { buildApp, fastifyPath, type AppOptions } from "./app";
export { createV1Handler, handleV1, v1Instance } from "./fetch";
export { apiOperation, CONTRACT_OPERATIONS, HANDLED, SERVED, V1_OPERATIONS, withHandlers, type Handler, type Handlers } from "./operations";

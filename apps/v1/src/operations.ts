// The operations /v1 serves, built from the registry: each entry in
// packages/core OPERATIONS with its contract in OPERATION_IO (input,
// output, method and path, argument names, paging). Nothing here is
// written by hand, so /v1, MCP and Ask Jonz can't disagree on an operation.
//
// Served: every operation that runs a database function, and every
// operation whose logic is TypeScript (`rpc.server`, or a route with no
// database function), once its host hands in a handler for it
// (`withHandlers`). apps/api does, with the logic it already had.
//
// An operation, once served, only gains optional inputs and new output
// fields; anything else is /v2 (CI's oasdiff step refuses it).

import { camelKeys, fromPage, OPERATION_IO, OPERATIONS, rpcArgs, type Operation, type OperationIo, type OperationName } from "@app/core";
import type { ApiOperation, HandlerContext, HttpMethod } from "@app/server";

export function apiOperation(name: OperationName): ApiOperation {
  const io: OperationIo = OPERATION_IO[name];
  const [method, path] = io.http.split(" ") as [HttpMethod, string];
  return {
    name,
    operation: OPERATIONS[name],
    input: io.input,
    output: io.output,
    http: { method, path },
    rpcArgs: (input) => rpcArgs(name, input),
    fromResult: io.page ? (raw, input) => fromPage(name, input as { limit?: number }, (raw as unknown[] | null) ?? []) : camelKeys,
  };
}

const NAMES = Object.keys(OPERATIONS) as OperationName[];
const runsOnServer = (name: OperationName) => {
  const rpc = (OPERATIONS[name] as Operation).rpc;
  return !rpc || !!rpc.server;
};

/** Operations served by their database function alone. */
export const SERVED = NAMES.filter((name) => !runsOnServer(name));

/** Operations whose logic is TypeScript: served once a handler is handed in. */
export const HANDLED = NAMES.filter(runsOnServer);

/** What runs a server operation, given the checks have passed. */
export type Handler = (context: HandlerContext) => Promise<unknown>;
export type Handlers = Partial<Record<OperationName, Handler>>;

/** Operations served by their database function alone. */
export const V1_OPERATIONS: readonly ApiOperation[] = SERVED.map(apiOperation);

/** Every operation in the contract (the OpenAPI document): the database ones and the server ones. */
export const CONTRACT_OPERATIONS: readonly ApiOperation[] = [...SERVED, ...HANDLED].map(apiOperation);

/** The database ones, plus each server one this host has a handler for. */
export function withHandlers(handlers: Handlers): readonly ApiOperation[] {
  const handled = HANDLED.filter((name) => handlers[name]).map((name) => ({ ...apiOperation(name), handler: handlers[name] }));
  return [...V1_OPERATIONS, ...handled];
}

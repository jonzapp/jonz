// The operations /v1 serves, built from the registry: each entry in
// packages/core OPERATIONS with its contract in OPERATION_IO (input,
// output, method and path, argument names, paging). Nothing here is
// written by hand, so /v1, MCP and Ask Jonz can't disagree on an operation.
//
// Served now: every operation that runs a database function. Still to come
// (step C2): the table-only operations, once each has its own function,
// and the `rpc.server` ones, once their logic moves out of apps/api into a
// handler here.
//
// An operation, once served, only gains optional inputs and new output
// fields; anything else is /v2 (CI's oasdiff step refuses it).

import { camelKeys, fromPage, OPERATION_IO, OPERATIONS, rpcArgs, type Operation, type OperationIo, type OperationName } from "@app/core";
import type { ApiOperation, HttpMethod } from "@app/server";

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

/** Operations served by their database function alone. */
export const SERVED = (Object.keys(OPERATIONS) as OperationName[]).filter((name) => {
  const rpc = (OPERATIONS[name] as Operation).rpc;
  return rpc && !rpc.server;
});

export const V1_OPERATIONS: readonly ApiOperation[] = SERVED.map(apiOperation);

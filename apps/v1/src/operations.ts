// The operations /v1 serves. Each is a registry entry (packages/core
// operations.ts) with its input and output contract and its method and path.
// They are added as the app moves onto /v1 (step C2), from the registry's
// contracts (packages/core OPERATION_IO). An operation, once here, only gains
// optional inputs and new output fields; anything else is /v2 (CI's oasdiff
// step refuses it).

import type { ApiOperation } from "@app/server";

export const V1_OPERATIONS: readonly ApiOperation[] = [];

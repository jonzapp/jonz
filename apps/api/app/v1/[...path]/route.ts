import { createV1Handler } from "v1";

import { V1_HANDLERS } from "@/lib/v1/handlers";

/**
 * /v1, the versioned API (docs/specs/api.md), served from this project at
 * api.jonz.app/v1. apps/v1 does all of it; this hands the request over, with
 * the handlers for the operations whose logic lives here (lib/v1/handlers.ts).
 * Node, not the edge: it holds a Postgres pool.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Ask Jonz reads a few lists before it answers.
export const maxDuration = 60;

const handleV1 = createV1Handler(V1_HANDLERS);

export const GET = handleV1;
export const POST = handleV1;
export const PATCH = handleV1;
export const PUT = handleV1;
export const DELETE = handleV1;
export const OPTIONS = handleV1;

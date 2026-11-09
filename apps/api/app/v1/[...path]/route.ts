import { handleV1 } from "v1";

/**
 * /v1, the versioned API (docs/specs/api.md), served from this project at
 * api.jonz.app/v1. apps/v1 does all of it; this only hands the request over.
 * Node, not the edge: it holds a Postgres pool.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleV1;
export const POST = handleV1;
export const PATCH = handleV1;
export const PUT = handleV1;
export const DELETE = handleV1;
export const OPTIONS = handleV1;

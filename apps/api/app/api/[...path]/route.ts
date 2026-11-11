import { error, wordsOf } from "@/lib/respond";

/**
 * Any /api path no route claims. An API answers in JSON, so this replaces
 * Next's HTML not-found page; a real route always wins over a catch-all.
 */
function missing(request: Request): Response {
  return error(request, 404, wordsOf(request)("errors.api.nothingHere"));
}

export const GET = missing;
export const POST = missing;
export const PUT = missing;
export const PATCH = missing;
export const DELETE = missing;

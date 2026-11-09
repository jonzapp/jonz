// Errors as RFC 9457 problem details: one shape for every refusal, with a
// stable `code` the app and MCP clients can branch on.

export const PROBLEM_CODES = {
  unauthenticated: 401,
  pass_required: 402,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_mismatch: 422,
  invalid_input: 400,
  rejected: 400,
  client_too_old: 426,
  rate_limited: 429,
  internal: 500,
} as const;

export type ProblemCode = keyof typeof PROBLEM_CODES;

export interface ProblemBody {
  type: string;
  title: ProblemCode;
  status: number;
  detail: string;
  requestId?: string;
  /** A connected app's request that can't be undone (forbidden until approved): where the person approves it in Jonz. */
  approvalUrl?: string;
}

export class Problem extends Error {
  readonly status: number;
  constructor(
    readonly code: ProblemCode,
    detail: string,
    readonly headers: Record<string, string> = {},
    /** More for the caller to act on, added to the body (a held request's approvalUrl). */
    readonly extra: { approvalUrl?: string } = {},
  ) {
    super(detail);
    this.status = PROBLEM_CODES[code];
  }

  body(requestId?: string): ProblemBody {
    return {
      type: `https://api.jonz.app/problems/${this.code}`,
      title: this.code,
      status: this.status,
      detail: this.message,
      ...this.extra,
      ...(requestId ? { requestId } : {}),
    };
  }
}

export const PROBLEM_MEDIA_TYPE = "application/problem+json";

/** The only words a caller ever gets for something we didn't expect. */
export const internalProblem = () => new Problem("internal", "Something went wrong on our side.");

/** /v1 and /mcp on a host whose database isn't set: a 503 (the status, not a new code, so the contract holds). */
export const notSetUpProblem = () => new Problem("internal", "The API isn't set up here yet.");

/** Any thrown value as a Problem; anything unexpected is a plain 500 that leaks nothing. */
export function asProblem(error: unknown): Problem {
  return error instanceof Problem ? error : internalProblem();
}

/** A new request id, in the one shape every answer and log line uses. */
export const newRequestId = () => `req_${crypto.randomUUID()}`;

/** A Problem as a web-standard Response (problem+json, its headers, and the request id). `status` overrides the code's, for a 503. */
export function problemResponse(problem: Problem, options: { requestId?: string; status?: number } = {}): Response {
  const status = options.status ?? problem.status;
  const { requestId } = options;
  return Response.json(
    { ...problem.body(requestId), status },
    { status, headers: { "content-type": PROBLEM_MEDIA_TYPE, ...problem.headers, ...(requestId ? { "request-id": requestId } : {}) } },
  );
}

/**
 * Wraps a web-standard handler (/v1, /mcp) so anything it throws answers
 * problem+json: what went wrong goes to the logs with a request id, never to
 * the caller.
 */
export function answersSafely<A extends unknown[]>(name: string, handler: (request: Request, ...rest: A) => Promise<Response>) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    try {
      return await handler(request, ...rest);
    } catch (error) {
      const requestId = newRequestId();
      if (!(error instanceof Problem)) console.error(`[${requestId}] ${name} failed`, error);
      return problemResponse(asProblem(error), { requestId });
    }
  };
}

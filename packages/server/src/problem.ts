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
}

export class Problem extends Error {
  readonly status: number;
  constructor(
    readonly code: ProblemCode,
    detail: string,
    readonly headers: Record<string, string> = {},
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
      ...(requestId ? { requestId } : {}),
    };
  }
}

/** Any thrown value as a Problem; anything unexpected is a plain 500 that leaks nothing. */
export function asProblem(error: unknown): Problem {
  return error instanceof Problem ? error : new Problem("internal", "Something went wrong on our side.");
}

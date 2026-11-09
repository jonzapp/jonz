import type { ApprovalRow } from '@app/core';

import { callV1 } from './v1';

// A connected app's request to do something that can't be undone
// (supabase/migrations/*_mcp_approvals.sql): read and answered with your own
// session in Jonz, never the app's token, which the database refuses here.

/** The request, or null when it isn't yours or isn't there. */
export async function readApproval(id: string): Promise<ApprovalRow | null> {
  const row = await callV1('api_approval', { approvalId: id });
  return (
    row && {
      id: row.id,
      operation: row.operation,
      input: row.input,
      house_id: row.houseId,
      house_name: row.houseName,
      created_at: row.createdAt,
      expires_at: row.expiresAt,
      approved_at: row.approvedAt,
      declined_at: row.declinedAt,
      used_at: row.usedAt,
    }
  );
}

/** Approve or decline it, once. */
export async function answerApproval(id: string, approve: boolean): Promise<void> {
  await callV1('answer_api_approval', { approvalId: id, approve });
}

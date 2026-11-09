import { ApprovalRow, humanError } from '@app/core';

import { supabase } from './supabase';

// A connected app's request to do something that can't be undone
// (supabase/migrations/*_mcp_approvals.sql): read and answered with your own
// session in Jonz, never the app's token, which the database refuses here.

/** The request, or null when it isn't yours or isn't there. */
export async function readApproval(id: string): Promise<ApprovalRow | null> {
  const { data, error } = await supabase.rpc('api_approval', { p_id: id });
  if (error) throw new Error(humanError(error));
  return data === null ? null : ApprovalRow.parse(data);
}

/** Approve or decline it, once. */
export async function answerApproval(id: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('answer_api_approval', { p_id: id, p_approve: approve });
  if (error) throw new Error(humanError(error));
}

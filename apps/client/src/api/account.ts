import type { DeletionPreview, DeletionStatus } from '@app/core';

import { supabase } from './supabase';
import { callV1 } from './v1';

// Deleting your account (supabase/migrations/*_delete_account.sql), on /v1:
// asked for here, it waits 30 days, in which Keep my account stops it. The
// clock does the rest.

/** What the Delete sheet says: your house, until when a Pass you pay for lasts, and the day it would go. */
export async function deletionPreview(): Promise<DeletionPreview> {
  return callV1('account_deletion_preview', {});
}

/**
 * Starts the 30 days, and signs you out everywhere else: on this device the
 * being-deleted screen says when it goes. Says when.
 */
export async function requestDeletion(): Promise<string> {
  const deleteAfter = await callV1('request_account_deletion', {});
  // Other phones and laptops signed in as you: signed out, so nobody carries on there.
  await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
  return deleteAfter;
}

/** Keep my account: the 30 days stop. */
export async function keepAccount(): Promise<void> {
  await callV1('keep_account', {});
}

/** Yours while it waits; null when your account isn't being deleted. */
export async function deletionStatus(): Promise<DeletionStatus | null> {
  const status = await callV1('account_deletion_status', {});
  return status && { deleteAfter: status.deleteAfter, requestedBy: status.requestedBy === 'owner' ? 'owner' : 'self' };
}

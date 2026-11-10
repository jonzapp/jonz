import { type Words, supportThinking, reportGist, type SupportDraft } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, SendIcon, SparklesIcon, UserXIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteByEmail } from '@/api/owner';
import { setSameAs, setSupportDraft, supportDraft, type Report } from '@/api/reports';
import { ownerPieces } from '@/components/admin/owner-pieces';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Group, GroupItem } from '@/components/group';
import { Thinking } from '@/components/house/thinking';
import { Reply } from '@/components/reply/reply';
import { Row, RowIcon } from '@/components/row';
import { Sheet } from '@/components/sheet';
import { Body, Meta } from '@/components/text';
import { SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

const PIECES = (words: Words) => ownerPieces(words);

/** Whether the support agent has something to suggest on this report: it's waiting, and there's someone to answer. */
export function draftable(report: Report): boolean {
  const waiting = report.state === 'new' || report.state === 'open';
  const answerable = report.userId !== null || (report.source === 'email' && report.email !== null);
  return waiting && answerable && report.messages.at(-1)?.from !== 'jonz';
}

/**
 * The support agent's suggestion on a report (docs/specs/report-a-problem.md,
 * "The support agent"): Jonz's reasons, the reply it would send, and the
 * one step it would take with it, on one card with one amber button. It
 * asks before it acts: nothing is sent, folded or started until the owner
 * taps, and a deletion asks again. "Change it first" puts the words in the
 * reply box; "Not this" sets it aside.
 */
export function SupportDraftCard({
  report,
  queryKey,
  onReply,
  onEdit,
  onDone,
}: {
  report: Report;
  /** Where the report's reads live, so the suggestion is kept beside them. */
  queryKey: readonly unknown[];
  onReply: (text: string) => Promise<void>;
  /** Put the suggested words in the reply box, to change before sending. */
  onEdit: (text: string, draftId: string) => void;
  onDone: () => Promise<void>;
}) {
  const words = useWords();
  const client = useQueryClient();
  // A new word from the sender is a new suggestion.
  const key = [...queryKey, 'draft', report.messages.length];
  const draft = useQuery({
    queryKey: key,
    queryFn: () => supportDraft(report.id),
    enabled: draftable(report),
    staleTime: Infinity,
    retry: false,
    // Written elsewhere a moment ago (another tab): look again until it's ready.
    refetchInterval: (query) => (query.state.data?.state === 'drafting' ? 4000 : false),
  });
  if (!draftable(report)) return null;
  if (draft.isPending) return <Thinking steps={supportThinking(words)} />;
  // No suggestion (no Claude here, or today's are used up) leaves the reply box as it was.
  if (draft.isError || !draft.data) return null;
  const one = draft.data;
  if (one.state === 'drafting') return <Thinking steps={supportThinking(words)} />;
  if (one.state === 'failed') return <Meta testID="support-draft-failed">{words('admin.support.failed')}</Meta>;
  if (one.state !== 'ready') return null;
  return (
    <Ready
      report={report}
      draft={one}
      onReply={onReply}
      onEdit={onEdit}
      onDone={async () => {
        client.setQueryData(key, { ...one, state: 'used' });
        await onDone();
      }}
      onDismiss={async () => {
        await setSupportDraft(one.id, 'dismissed');
        client.setQueryData(key, { ...one, state: 'dismissed' });
      }}
    />
  );
}

function Ready({
  report,
  draft,
  onReply,
  onEdit,
  onDone,
  onDismiss,
}: {
  report: Report;
  draft: SupportDraft;
  onReply: (text: string) => Promise<void>;
  onEdit: (text: string, draftId: string) => void;
  onDone: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const first = report.name?.split(' ')[0] ?? '';
  const foldName = draft.sameAs?.name?.split(' ')[0] ?? '';
  const label =
    draft.action === 'same_as' && draft.sameAs
      ? words('admin.support.sendAndFold', { name: foldName })
      : draft.action === 'delete'
        ? words('admin.support.sendAndDelete')
        : words('admin.support.send');

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await step();
      await onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const approve = () =>
    run(async () => {
      await onReply(draft.reply);
      if (draft.action === 'same_as' && draft.sameAs) await setSameAs(report.id, draft.sameAs.id);
      await setSupportDraft(draft.id, 'used');
    });
  const approveDelete = () =>
    run(async () => {
      setAsking(false);
      await onReply(draft.reply);
      if (report.email) await deleteByEmail(report.email, words('admin.support.deleteReason'));
      await setSupportDraft(draft.id, 'used');
    });

  return (
    <View style={styles.card} testID="support-draft">
      <View style={styles.label}>
        <SparklesIcon size={16} color={colors.mutedForeground} aria-hidden />
        <Meta>{words('admin.support.label')}</Meta>
      </View>
      {draft.why ? <Reply source={draft.why} pieces={PIECES(words)} testID="support-draft-why" /> : null}
      <Group>
        <GroupItem testID="support-draft-reply">
          <View style={styles.reply}>
            <Body>{draft.reply}</Body>
          </View>
        </GroupItem>
        {draft.action === 'same_as' && draft.sameAs ? (
          <Row
            leading={<RowIcon icon={CopyIcon} />}
            title={words('admin.support.sameAs', { name: foldName })}
            meta={reportGist(draft.sameAs.words)}
            href={`/admin/inbox/${draft.sameAs.id}`}
            chevron
            testID="support-draft-same-as"
          />
        ) : null}
        {draft.action === 'delete' ? <Row leading={<RowIcon icon={UserXIcon} />} title={words('admin.support.deleteStep')} testID="support-draft-delete" /> : null}
      </Group>
      {problem ? <Alert message={problem} testID="support-draft-problem" /> : null}
      <ButtonRow>
        <Button
          label={label}
          busyLabel={words('admin.support.sending')}
          icon={SendIcon}
          busy={busy}
          onPress={() => (draft.action === 'delete' ? setAsking(true) : void approve())}
          testID="support-draft-send"
        />
        <Button label={words('admin.support.edit')} variant="outline" onPress={() => onEdit(draft.reply, draft.id)} testID="support-draft-edit" />
        <Button label={words('admin.support.dismiss')} variant="ghost" onPress={() => void onDismiss().catch((e) => setProblem(String(e)))} testID="support-draft-dismiss" />
      </ButtonRow>
      <Meta>{words('admin.support.note')}</Meta>
      <Sheet
        visible={asking}
        title={words('admin.support.deleteTitle')}
        description={words('admin.support.deleteBody', { name: first })}
        onClose={() => setAsking(false)}
        testID="support-draft-delete-sheet"
      >
        <ButtonRow>
          <Button label={words('admin.support.deleteYes')} variant="hazard" icon={UserXIcon} onPress={() => void approveDelete()} testID="support-draft-delete-yes" />
        </ButtonRow>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md },
  label: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  reply: { paddingVertical: SPACE.md },
});

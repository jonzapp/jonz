import { humanError, REPORT_COPY, REPORT_LIMITS, reportGist } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, MailIcon, RotateCcwIcon, SearchIcon, UnlinkIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fixReport, openReport, replyToReport, sameAsFind, setReportState, setSameAs, setSupportDraft, type Report, type ReportLink } from '@/api/reports';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Group } from '@/components/group';
import { DetailsList, ReplyBox, ReportChip, ReportThread } from '@/components/report/report-parts';
import { SupportDraftCard } from '@/components/admin/support-draft';
import { Row, RowIcon } from '@/components/row';
import { ChoiceRow } from '@/components/setup/choice-row';
import { PanelOutline } from '@/components/page-outlines';
import { ReadFailed } from '@/components/read-state';
import { Sheet } from '@/components/sheet';
import { Lead, Meta } from '@/components/text';
import { Waiting } from '@/components/waiting';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** The Inbox's reads, so a reply or a fix can refresh the list, the count and the report together. */
export const INBOX_KEY = ['owner-inbox'] as const;

/**
 * One report, for the owner: who sent it and from where (the app, or an
 * email), the conversation, what the app sent with it, a box to reply (in
 * the app and by email, or by email alone), the reports folded into it,
 * and its actions: Mark fixed (telling everyone who reported it) or Open it
 * again, and Same as… to fold it into another. Opening a new one marks it read.
 */
export function ReportPanel({ id, onOpen }: { id: string; onOpen?: (id: string) => void }) {
  const client = useQueryClient();
  const report = useQuery({ queryKey: [...INBOX_KEY, 'report', id], queryFn: () => openReport(id) });
  // Opening it may have marked it read: the list's chip says so too.
  const opened = report.data?.id;
  useEffect(() => {
    if (opened) void client.invalidateQueries({ queryKey: [...INBOX_KEY, 'rows'] });
  }, [client, opened]);
  const refresh = () => client.invalidateQueries({ queryKey: INBOX_KEY });
  const reopen = useMutation({ mutationFn: () => setReportState(id, 'open'), onSuccess: refresh });

  if (report.isPending) return <Waiting ready={false} outline={<PanelOutline sections={[2, 3]} button />} />;
  if (report.isError) return <ReadFailed message={humanError(report.error)} onRetry={() => void report.refetch()} testID="report-panel-problem" />;
  return (
    <ReportBody
      report={report.data}
      reopen={reopen}
      refresh={refresh}
      onOpen={onOpen}
      onReply={async (text) => {
        await replyToReport(id, text);
        await refresh();
      }}
    />
  );
}

function ReportBody({
  report,
  reopen,
  refresh,
  onOpen,
  onReply,
}: {
  report: Report;
  reopen: { mutate: () => void; isPending: boolean; error: Error | null };
  refresh: () => Promise<void>;
  onOpen?: (id: string) => void;
  onReply: (text: string) => Promise<void>;
}) {
  const words = useWords();
  const [sheet, setSheet] = useState<'fix' | 'same' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [unfolding, setUnfolding] = useState<string | null>(null);
  // The reply box's words, which the support agent's "Change it first" fills; and which suggestion they came from.
  const [replyText, setReplyText] = useState('');
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const first = report.name?.split(' ')[0] ?? REPORT_COPY.gone;
  const emailOnly = report.source === 'email' && !report.userId;
  const where = emailOnly
    ? REPORT_COPY.emailOnly(report.email ?? REPORT_COPY.gone)
    : [
        report.house ?? REPORT_COPY.noHouse,
        report.role ? (REPORT_COPY.role[report.role as 'admin' | 'member'] ?? null) : null,
        report.email,
        report.source === 'email' ? REPORT_COPY.byEmail : null,
      ]
        .filter(Boolean)
        .join(', ');
  const fixed = report.state === 'fixed';
  // Someone to answer: their account, or the address the email came from.
  const answerable = report.userId !== null || (emailOnly && report.email !== null);
  const unfold = async () => {
    setUnfolding(null);
    try {
      await setSameAs(report.id, null);
      await refresh();
    } catch (e) {
      setUnfolding(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={styles.panel} testID="report-panel">
      <View style={styles.head}>
        <View style={styles.titleLine}>
          <Lead header style={styles.name}>
            {report.name ?? REPORT_COPY.gone}
          </Lead>
          <ReportChip state={report.state} owner testID="report-panel-state" />
        </View>
        <Meta>{where}</Meta>
        {report.subject ? <Meta testID="report-panel-subject">{REPORT_COPY.subject(report.subject)}</Meta> : null}
      </View>
      {report.sameAs ? (
        <Group testID="report-same-as">
          <Row
            leading={<RowIcon icon={CopyIcon} />}
            title={REPORT_COPY.foldedInto(report.sameAs.name?.split(' ')[0] ?? REPORT_COPY.gone)}
            meta={reportGist(report.sameAs.words)}
            onPress={onOpen ? () => onOpen(report.sameAs!.id) : undefined}
            href={onOpen ? undefined : `/admin/inbox/${report.sameAs.id}`}
            chevron
            testID="report-same-as-link"
          />
          <Row leading={<RowIcon icon={UnlinkIcon} />} title={REPORT_COPY.notSame} onPress={() => void unfold()} testID="report-not-same" />
        </Group>
      ) : null}
      {unfolding ? <Alert message={unfolding} /> : null}
      <ReportThread report={report} viewer="owner" />
      {report.details ? (
        <Group>
          <DetailsList details={report.details} />
        </Group>
      ) : null}
      {report.also.length > 0 ? <AlsoReported also={report.also} onOpen={onOpen} /> : null}
      {answerable ? (
        <SupportDraftCard
          report={report}
          queryKey={[...INBOX_KEY, 'report', report.id]}
          onReply={onReply}
          onEdit={(text, draftId) => {
            setReplyText(text);
            setFromDraft(draftId);
          }}
          onDone={refresh}
        />
      ) : null}
      {answerable ? (
        <ReplyBox
          placeholder={emailOnly ? REPORT_COPY.replyByEmail(first) : REPORT_COPY.replyTo(first)}
          text={replyText}
          onChangeText={setReplyText}
          onSend={async (text) => {
            await onReply(text);
            if (fromDraft) {
              setFromDraft(null);
              // The reply went; whether the suggestion is marked used doesn't matter to the person.
              await setSupportDraft(fromDraft, 'used').catch(() => undefined);
            }
          }}
          bare
          testID="report-reply"
        />
      ) : null}
      <ButtonRow atEdge>
        <Button
          label={fixed ? REPORT_COPY.reopen : REPORT_COPY.markFixed}
          icon={fixed ? RotateCcwIcon : CheckIcon}
          variant="outline"
          busy={reopen.isPending}
          busyLabel={words('common.busy.reopening')}
          onPress={() => {
            setDone(null);
            if (fixed) reopen.mutate();
            else setSheet('fix');
          }}
          testID={fixed ? 'report-reopen' : 'report-fixed'}
        />
        {report.sameAs ? null : (
          <Button label={REPORT_COPY.sameAs} icon={CopyIcon} variant="outline" onPress={() => setSheet('same')} testID="report-same" />
        )}
      </ButtonRow>
      {done ? <Meta testID="report-fixed-done">{done}</Meta> : null}
      {reopen.error ? <Alert message={reopen.error.message} /> : null}
      <Meta>{REPORT_COPY.note}</Meta>
      <Sheet visible={sheet === 'fix'} title={REPORT_COPY.fixTitle} onClose={() => setSheet(null)} testID="report-fix-sheet">
        {sheet === 'fix' ? (
          <FixForm
            report={report}
            onDone={async (said) => {
              setSheet(null);
              setDone(said);
              await refresh();
            }}
          />
        ) : null}
      </Sheet>
      <Sheet
        visible={sheet === 'same'}
        title={REPORT_COPY.sameAsTitle}
        description={REPORT_COPY.sameAsBody}
        onClose={() => setSheet(null)}
        testID="report-same-sheet"
      >
        {sheet === 'same' ? (
          <SameAsForm
            report={report}
            onDone={async () => {
              setSheet(null);
              await refresh();
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

/** The reports folded into this one: who sent each, and what they said. */
function AlsoReported({ also, onOpen }: { also: readonly ReportLink[]; onOpen?: (id: string) => void }) {
  return (
    <View style={styles.also} testID="report-also">
      <Meta>{REPORT_COPY.alsoFrom(also.length)}</Meta>
      <Group>
        {also.map((one) => (
          <Row
            key={one.id}
            title={one.name ?? REPORT_COPY.gone}
            meta={reportGist(one.words)}
            trailing={<ReportChip state={one.state} owner />}
            onPress={onOpen ? () => onOpen(one.id) : undefined}
            href={onOpen ? undefined : `/admin/inbox/${one.id}`}
            chevron
            testID={`report-also-${one.id}`}
          />
        ))}
      </Group>
    </View>
  );
}

/**
 * Mark fixed: what changed (optional), and whether to tell everyone who
 * reported it, in the app and by email. The note goes in each of their
 * conversations; without one they read a plain thank you.
 */
function FixForm({ report, onDone }: { report: Report; onDone: (said: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const people = 1 + report.also.filter((one) => one.state !== 'fixed').length;
  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { told } = await fixReport(report.id, note, tell);
      await onDone(REPORT_COPY.fixedTold(told));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <View style={styles.form} testID="report-fix-form">
      <Field
        label={REPORT_COPY.fixNote}
        placeholder={REPORT_COPY.fixNotePlaceholder}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={REPORT_LIMITS.words}
        editable={tell}
        testID="report-fix-note"
      />
      <Group>
        <ChoiceRow
          role="checkbox"
          label={REPORT_COPY.fixTell(people)}
          meta={REPORT_COPY.fixTellMeta}
          checked={tell}
          onPress={() => setTell((on) => !on)}
        />
      </Group>
      {problem ? <Alert message={problem} testID="report-fix-problem" /> : null}
      <ButtonRow>
        <Button label={REPORT_COPY.fixSend} busyLabel={REPORT_COPY.sending} icon={tell ? MailIcon : CheckIcon} busy={busy} onPress={() => void send()} testID="report-fix-send" />
      </ButtonRow>
    </View>
  );
}

/** Same as…: search for the report this one repeats, and fold it in. */
function SameAsForm({ report, onDone }: { report: Report; onDone: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const found = useQuery({ queryKey: [...INBOX_KEY, 'same-as', report.id, q.trim()], queryFn: () => sameAsFind(report.id, q.trim()) });
  const pick = async (main: string) => {
    setProblem(null);
    try {
      await setSameAs(report.id, main);
      await onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={styles.form} testID="report-same-form">
      <Field label={REPORT_COPY.sameAsSearch} value={q} onChangeText={setQ} autoFocus testID="report-same-search" />
      {problem ? <Alert message={problem} /> : null}
      {found.isError ? <ReadFailed message={humanError(found.error)} onRetry={() => void found.refetch()} /> : null}
      {found.data && found.data.length === 0 ? <Meta>{REPORT_COPY.sameAsNone}</Meta> : null}
      {found.data && found.data.length > 0 ? (
        <Group>
          {found.data.map((one) => (
            <Row
              key={one.id}
              leading={<RowIcon icon={SearchIcon} />}
              title={one.name ?? REPORT_COPY.gone}
              meta={reportGist(one.words)}
              metaLines={2}
              trailing={<ReportChip state={one.state} owner />}
              onPress={() => void pick(one.id)}
              testID={`report-same-${one.id}`}
            />
          ))}
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.lg },
  head: { gap: SPACE.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  name: { flex: 1 },
  also: { gap: SPACE.sm },
  form: { gap: SPACE.lg },
});

import { ownerMoveMeta, ownerMoveIsDangerous, ownerMoveTitle, OWNER_MOVES_FINAL, type OwnerMove, type OwnerMoveKind, type Words } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  BanIcon,
  HouseIcon,
  CheckIcon,
  CircleCheckIcon,
  Link2Icon,
  MailIcon,
  MegaphoneIcon,
  MegaphoneOffIcon,
  RefreshCwIcon,
  ReplyIcon,
  RotateCcwIcon,
  SendIcon,
  TicketIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserXIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteHouse, ownerResetHouse } from '@/api/houses';
import { deleteByEmail, deleteNow, endNotice, saveNotice, stopDeletion } from '@/api/owner';
import { emailPromotion, makePromotion, retryPromotion, stopPromotion } from '@/api/promotions';
import { fixReport, replyToReport, setReportState, setSameAs } from '@/api/reports';
import { sendMessage } from '@/api/messages';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Row, RowIcon } from '@/components/row';
import { anyDangerous, MoveList } from '@/components/move-list';
import { ChoiceRow } from '@/components/setup/choice-row';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

const ICON: Record<OwnerMoveKind, LucideIcon> = {
  report_reply: ReplyIcon,
  report_fixed: CircleCheckIcon,
  report_open: RotateCcwIcon,
  report_same_as: Link2Icon,
  notice_save: MegaphoneIcon,
  notice_end: MegaphoneOffIcon,
  message_send: SendIcon,
  promotion_make: TicketIcon,
  promotion_stop: BanIcon,
  promotion_email: MailIcon,
  promotion_retry: RefreshCwIcon,
  deletion_now: Trash2Icon,
  deletion_stop: RotateCcwIcon,
  deletion_start: UserXIcon,
  house_delete: HouseIcon,
  house_reset: RotateCcwIcon,
};

/** Does one move through the admin page's own call, as the owner: the database checks it and the audit log keeps it. */
async function doOwnerMove(m: OwnerMove): Promise<void> {
  switch (m.kind) {
    case 'report_reply':
      return replyToReport(m.reportId, m.body);
    case 'report_fixed':
      await fixReport(m.reportId, m.note, m.tell);
      return;
    case 'report_open':
      return setReportState(m.reportId, 'open');
    case 'report_same_as':
      return setSameAs(m.reportId, m.mainId);
    case 'notice_save':
      await saveNotice({
        id: m.id,
        kind: m.notice,
        title: m.title,
        body: m.body,
        linkLabel: m.linkLabel,
        linkUrl: m.linkUrl,
        startsAt: m.startsAt ? new Date(m.startsAt) : null,
        endsAt: m.endsAt ? new Date(m.endsAt) : null,
      });
      return;
    case 'notice_end':
      await endNotice(m.id);
      return;
    case 'message_send':
      await sendMessage({ audience: m.audience, personId: m.personId, houseId: m.houseId, subject: m.subject, body: m.body, ways: { push: m.push, wall: m.wall, email: m.email } });
      return;
    case 'promotion_make':
      await makePromotion(m.promotion);
      return;
    case 'promotion_stop':
      return stopPromotion(m.id);
    case 'promotion_email':
      await emailPromotion(m.id);
      return;
    case 'promotion_retry':
      await retryPromotion(m.id);
      return;
    case 'deletion_now':
      return deleteNow(m.userId, m.reason);
    case 'deletion_stop':
      return stopDeletion(m.userId, m.reason);
    case 'deletion_start':
      return deleteByEmail(m.email, m.reason);
    case 'house_delete':
      await deleteHouse(m.houseId, m.reason, m.tell);
      return;
    case 'house_reset':
      return ownerResetHouse(m.houseId, m.everything, m.reason);
  }
}

/** A move's line under its title: what it does, and whether it can be taken back. */
function metaOf(m: OwnerMove, words: Words): string {
  const meta = ownerMoveMeta(m, words);
  return OWNER_MOVES_FINAL.includes(m.kind) ? `${words('admin.moves.final')}. ${meta}` : meta;
}

/**
 * The owner's Ask Jonz card: what Jonz offered to do, each row ticked and
 * untickable, the same as a house's MovesCard. Nothing happens before the
 * button; then each is done in turn through the admin pages' own calls, so
 * it's checked and logged exactly as a tap on the page would be. The admin
 * pages' lists read again after.
 */
export function OwnerMovesCard({ items, run = doOwnerMove }: { items: readonly OwnerMove[]; run?: (m: OwnerMove) => Promise<void> }) {
  const words = useWords();
  const client = useQueryClient();
  const [keep, setKeep] = useState<number[]>(() => items.map((_, at) => at));
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function apply() {
    setPending(true);
    setProblem(null);
    let count = 0;
    try {
      for (const at of keep) {
        await run(items[at]);
        count += 1;
      }
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
      void client.invalidateQueries();
    }
    // Part way through, what got done is done; the card says so, and the problem stays shown.
    if (count > 0) setDone(count);
  }

  if (done !== null) {
    return (
      <View style={styles.card} testID="owner-moves-done">
        <Row title={words('admin.moves.done', { n: done })} leading={<RowIcon icon={CheckIcon} />} />
        {problem ? <Alert message={problem} /> : null}
      </View>
    );
  }

  const toggle = (at: number) => setKeep((was) => (was.includes(at) ? was.filter((k) => k !== at) : [...was, at].sort((a, b) => a - b)));
  const danger = anyDangerous(items, keep, (m: OwnerMove) => ownerMoveIsDangerous(m.kind));
  return (
    <View style={styles.card} testID="owner-moves-card">
      <MoveList
        label={words('admin.moves.card')}
        meta={words('admin.moves.cardMeta')}
        items={items}
        dangerous={(m) => ownerMoveIsDangerous(m.kind)}
        row={(item, at) => (
          <ChoiceRow
            key={at}
            role="checkbox"
            label={ownerMoveTitle(item, words)}
            meta={metaOf(item, words)}
            leading={<RowIcon icon={ICON[item.kind]} />}
            checked={keep.includes(at)}
            onPress={() => toggle(at)}
            disabled={pending}
            metaLines={3}
            testID={`owner-move-${item.kind}`}
          />
        )}
        testID="owner-moves-list"
      />
      {problem ? <Alert message={problem} /> : null}
      <ButtonRow>
        <Button
          {...(danger ? { variant: 'hazard' as const, icon: TriangleAlertIcon } : {})}
          label={words('admin.moves.apply', { n: keep.length })}
          busyLabel={words('admin.moves.applying')}
          onPress={() => void apply()}
          disabled={keep.length === 0}
          busy={pending}
          testID="owner-moves-apply"
        />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.md },
});

import { resetSheet, resetTitle, type ResetSheet as ResetSheetWordsOut, type ResetWords } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { RotateCcwIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { applyReset, previewReset, type ResetAsk } from '@/api/resets';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { OutlineBar, OutlineText } from '@/components/outline';
import { ReadFailed } from '@/components/read-state';
import { Body, Meta, RowTitle } from '@/components/text';
import { houseKey } from '@/hooks/keys';
import { useHouse } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { Waiting } from '@/components/waiting';
import { OUTLINE, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** What the sheet needs to say a reset in words, besides the house's own names, money and zone. */
export type ResetSheetWords = Omit<ResetWords, 'kind' | 'nameOf' | 'viewerId' | 'currency' | 'zone'>;

/**
 * A reset on its way: what the server says it would change, in words, and
 * the move that makes it. After it, a toast offers Undo (History keeps it
 * for longer) and `onDone` runs.
 */
function useReset(ask: ResetAsk | null, userId: string, names: ResetSheetWords, onDone: () => void) {
  const words = useWords();
  const houseId = ask?.houseId ?? '';
  const { view } = useHouse(houseId, userId);
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const preview = useQuery({
    queryKey: [...houseKey(houseId), 'reset', ask],
    queryFn: () => previewReset(ask!),
    enabled: ask !== null,
    gcTime: 0,
  });
  const members = view?.snapshot.members ?? [];
  const full: ResetWords | null = ask
    ? {
        ...names,
        kind: ask.kind,
        viewerId: userId,
        nameOf: (id) => (id === userId ? 'You' : (members.find((m) => m.userId === id)?.name ?? 'Someone')),
        currency: view?.snapshot.rules.currency ?? 'GBP',
        zone: view?.snapshot.rules.timezone ?? 'UTC',
      }
    : null;
  const sheet = full && preview.data && !preview.data.nothing ? resetSheet(preview.data, full, words) : null;

  async function confirm() {
    let action = '';
    const done = await move.run(async () => {
      action = await applyReset(ask!);
    });
    if (!done) return;
    onDone();
    offer(words('house.resets.done'), { action });
  }

  return { full, sheet, preview, move, confirm };
}

/** The numbers: each line's label over its value, who is told, how long it can be undone. */
function ResetLines({ sheet }: { sheet: ResetSheetWordsOut }) {
  return (
    <View style={styles.lines} testID="reset-lines">
      {sheet.lines.map((line) => (
        <View key={line.key} style={styles.line} testID={`reset-${line.key}`}>
          <Meta>{line.label}</Meta>
          <Body>{line.value}</Body>
        </View>
      ))}
      <Body testID="reset-told">{sheet.told}</Body>
      <Meta>{sheet.undo}</Meta>
    </View>
  );
}

/** While the numbers are worked out: ResetLines in outline, or why they couldn't be. */
function Preview({ reset }: { reset: ReturnType<typeof useReset> }) {
  const words = useWords();
  if (reset.preview.isError) {
    return <ReadFailed message={words('house.resets.unreadable')} onRetry={() => void reset.preview.refetch()} />;
  }
  if (reset.preview.data) return null;
  return (
    <Waiting
      ready={false}
      label={words('house.resets.reading')}
      outline={
        <View style={styles.lines}>
          {[40, 55, 35].map((width) => (
            <View key={width} style={styles.line}>
              <OutlineBar width={`${width}%`} height={OUTLINE.meta} />
              <OutlineBar width={`${width + 25}%`} height={OUTLINE.title} />
            </View>
          ))}
          <OutlineText lines={2} />
        </View>
      }
    />
  );
}

/**
 * The reset sheet: every reset ends here, wherever it started (Week's
 * "•••", a person's page, the Stake). It says in numbers what the reset
 * would change (ticks cleared, balances, the Stake, the Track record, who
 * is told), then the hazard button names the reset. Nothing changes until
 * that button.
 */
export function ResetSheet({
  ask,
  userId,
  words: names,
  onClose,
  testID = 'reset-sheet',
}: {
  /** The reset; null keeps the sheet away. */
  ask: ResetAsk | null;
  /** Who's looking: the admin. */
  userId: string;
  words: ResetSheetWords;
  onClose: () => void;
  testID?: string;
}) {
  const words = useWords();
  const reset = useReset(ask, userId, names, onClose);
  if (!ask || !reset.full) return null;
  const { sheet, preview, move } = reset;
  return (
    <ConfirmSheet
      visible
      title={sheet?.title ?? resetTitle(reset.full, words)}
      body={sheet?.body ?? (preview.data?.nothing ? words('house.resets.nothing') : undefined)}
      confirmLabel={sheet ? sheet.confirm : null}
      icon={RotateCcwIcon}
      tone="hazard"
      busy={move.pending}
      busyLabel={words('common.busy.resetting')}
      problem={move.problem}
      onConfirm={() => void reset.confirm()}
      onClose={onClose}
      testID={testID}
    >
      {sheet ? <ResetLines sheet={sheet} /> : <Preview reset={reset} />}
    </ConfirmSheet>
  );
}

/**
 * The same, inside a sheet that's already up (the John sheet's "Change
 * result"): a sheet changes its own content rather than opening another.
 */
export function ResetPanel({
  ask,
  userId,
  words: names,
  onClose,
  testID = 'reset-panel',
}: {
  ask: ResetAsk;
  userId: string;
  words: ResetSheetWords;
  onClose: () => void;
  testID?: string;
}) {
  const words = useWords();
  const reset = useReset(ask, userId, names, onClose);
  const { sheet, preview, move } = reset;
  return (
    <View style={styles.panel} testID={testID}>
      <RowTitle>{sheet?.title ?? resetTitle(reset.full!, words)}</RowTitle>
      {sheet ? <Body>{sheet.body}</Body> : preview.data?.nothing ? <Body>{words('house.resets.nothing')}</Body> : null}
      {sheet ? <ResetLines sheet={sheet} /> : <Preview reset={reset} />}
      {move.problem ? <Alert message={move.problem} /> : null}
      <ButtonRow stacked>
        {sheet ? (
          <Button variant="hazard" icon={RotateCcwIcon} label={sheet.confirm} busy={move.pending} busyLabel={words('common.busy.resetting')} onPress={() => void reset.confirm()} testID="confirm" />
        ) : null}
        <Button variant="outline" label={words('common.shell.cancel')} onPress={onClose} testID="cancel" />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  lines: { gap: SPACE.md },
  line: { gap: SPACE.xs },
  panel: { gap: SPACE.md },
});

import { DEAL_COPY } from '@app/core';
import { ShuffleIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { dealThisWeek } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Deal this week's Johns, as the web's button does, with a refusal under
 * it. The first time, it is the moment the house begins: amber, the
 * screen's one; afterwards it re-deals a week nobody has ticked anything
 * in, in outline. The first deal is "Deal week 1" on every screen; `label`
 * can say it otherwise, and `variant` overrides the colour (Today's setup
 * checklist and Week keep it outline until the steps before it have
 * something).
 * Like every button on its own it fills its column on a phone (ButtonRow).
 * On a laptop it keeps its own width on the leading edge of the bare page,
 * or with `fill` spans its card (Today's setup card). The server checks
 * it's an admin asking.
 */
export function DealButton({
  houseId,
  started = false,
  label,
  variant,
  fill = false,
}: {
  houseId: string;
  /** The house has dealt before. */
  started?: boolean;
  label?: string;
  variant?: 'primary' | 'outline';
  /** In a card: across it on a laptop too. */
  fill?: boolean;
}) {
  const words = useWords();
  const move = useMove(houseId);
  return (
    <View style={styles.stack}>
      <ButtonRow atEdge={!fill}>
        <Button
          variant={variant ?? (started ? 'outline' : 'primary')}
          icon={ShuffleIcon}
          label={label ?? (started ? DEAL_COPY.again : words('today.nextUp.dealWeek1'))}
          busyLabel={DEAL_COPY.dealing}
          busy={move.pending}
          onPress={() => void move.run(() => dealThisWeek(houseId))}
          testID="deal-week"
        />
      </ButtonRow>
      {move.problem ? <Alert message={move.problem} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
});

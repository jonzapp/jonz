import { firstName, memberCan, ON_CALL_COPY, type BoardItem } from '@app/core';
import { FlagOffIcon } from 'lucide-react-native';

import { removeFlag } from '@/api/johns';
import { Alert } from '@/components/alert';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Body, Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { useTheme } from '@/theme';

import type { JohnSheetContext } from './body';
import { SheetLines } from './parts';

/**
 * An open flag's way down. Whoever raised it, and an admin, get "Remove
 * flag": a flag raised by mistake is taken down with its points and its
 * Wall post, and whoever has it isn't asked again. Whoever has a flag
 * someone else raised is told who can take it down instead, so being on
 * call isn't a way out of it. Nothing on anything but an open flag.
 */
export function FlagPart({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  const { colors } = useTheme();
  const move = useMove(context.houseId);
  const toast = useToastIfAny();
  if (item.flaggedAt === null || item.doneAt !== null || item.outcome !== null) return null;

  const raisedByMe = item.flaggedBy === context.userId;
  if (!raisedByMe && !memberCan(context.me, 'flags.remove_any')) {
    if (item.userId !== context.userId) return null;
    return (
      <SheetLines testID="flag-who-can-remove">
        <Meta>{item.flaggedBy ? ON_CALL_COPY.onlyRaiser(firstName(context.nameOf(item.flaggedBy))) : ON_CALL_COPY.onlyAdmin}</Meta>
      </SheetLines>
    );
  }

  const remove = () =>
    void move.run(() => removeFlag(item.id)).then((done) => {
      if (!done) return;
      context.close();
      toast?.show(ON_CALL_COPY.removed);
    });
  return (
    <SheetLines testID="flag-remove">
      <Body>
        {item.userId === context.userId ? ON_CALL_COPY.removeBodyYours : ON_CALL_COPY.removeBody(firstName(context.nameOf(item.userId)))}
      </Body>
      <Group>
        <Row
          leading={<FlagOffIcon size={24} color={colors.hazard} aria-hidden />}
          title={move.pending ? ON_CALL_COPY.removing : ON_CALL_COPY.removeFlag}
          tone="hazard"
          disabled={move.pending}
          onPress={remove}
          testID="remove-flag"
        />
      </Group>
      {move.problem ? <Alert message={move.problem} /> : null}
    </SheetLines>
  );
}

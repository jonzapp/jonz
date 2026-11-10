import { firstName, memberCan, type BoardItem } from '@app/core';
import { FlagOffIcon } from 'lucide-react-native';

import { removeFlag } from '@/api/johns';
import { Alert } from '@/components/alert';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Body, Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import { useWords } from '@/hooks/use-words';
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
  const words = useWords();
  if (item.flaggedAt === null || item.doneAt !== null || item.outcome !== null) return null;

  const raisedByMe = item.flaggedBy === context.userId;
  if (!raisedByMe && !memberCan(context.me, 'flags:write')) {
    if (item.userId !== context.userId) return null;
    return (
      <SheetLines testID="flag-who-can-remove">
        <Meta>{item.flaggedBy ? words('today.onCall.onlyRaiser', { name: firstName(context.nameOf(item.flaggedBy)) }) : words('today.onCall.onlyAdmin')}</Meta>
      </SheetLines>
    );
  }

  const remove = () =>
    void move.run(() => removeFlag(item.id)).then((done) => {
      if (!done) return;
      context.close();
      toast?.show(words('today.onCall.removed'));
    });
  return (
    <SheetLines testID="flag-remove">
      <Body>
        {item.userId === context.userId ? words('today.onCall.removeBodyYours') : words('today.onCall.removeBody', { holder: firstName(context.nameOf(item.userId)) })}
      </Body>
      <Group>
        <Row
          leading={<FlagOffIcon size={24} color={colors.hazard} aria-hidden />}
          title={move.pending ? words('today.onCall.removing') : words('today.onCall.removeFlag')}
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

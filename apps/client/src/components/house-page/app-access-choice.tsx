import { APP_ACCESS, type AppAccess } from '@app/core';

import { CardRows, Group } from '@/components/group';
import { ChoiceRow } from '@/components/setup/choice-row';
import { useWords } from '@/hooks/use-words';

/** The words for each choice, as a row and as Connected apps' meta line. */
export function useAppAccessWords() {
  const words = useWords();
  return {
    name: (access: AppAccess) => words(access === 'read' ? 'people.appAccess.read' : 'people.appAccess.write'),
    meta: (access: AppAccess) => words(access === 'read' ? 'people.appAccess.readMeta' : 'people.appAccess.writeMeta'),
  };
}

/**
 * What a connected app may do: Read only, or Read and change. Two radio rows,
 * each saying what it means. In a card (the consent page's sign) they sit on
 * the card; elsewhere (Connected apps' sheet) in a group of their own.
 */
export function AppAccessChoice({
  value,
  onChange,
  inCard = false,
  disabled = false,
}: {
  value: AppAccess;
  onChange: (access: AppAccess) => void;
  inCard?: boolean;
  disabled?: boolean;
}) {
  const say = useAppAccessWords();
  const rows = APP_ACCESS.map((access) => (
    <ChoiceRow
      key={access}
      role="radio"
      label={say.name(access)}
      meta={say.meta(access)}
      metaLines={3}
      checked={value === access}
      disabled={disabled}
      onPress={() => onChange(access)}
      testID={`app-access-${access}`}
    />
  ));
  return inCard ? <CardRows testID="app-access">{rows}</CardRows> : <Group testID="app-access">{rows}</Group>;
}

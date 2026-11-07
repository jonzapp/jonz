import { memberCan, type HouseRole } from '@app/core';
import { SparklesIcon } from 'lucide-react-native';

import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { useAskJonz } from '@/hooks/use-ask-jonz';

/** The guide's way to Ask Jonz instead: the chat's page on a phone, its panel beside the page on a laptop. Nothing for someone who can't ask. */
export function AskRow({ me, title }: { me: { role: HouseRole } | null; title: string }) {
  const ask = useAskJonz('open');
  if (!memberCan(me, 'house.read')) return null;
  return (
    <Group>
      <Row
        leading={<RowIcon icon={SparklesIcon} />}
        title={title}
        chevron
        {...('href' in ask ? { href: ask.href } : { onPress: ask.onPress })}
        testID="guide-ask"
      />
    </Group>
  );
}

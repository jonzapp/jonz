import { comingUp, pointsLabel, type IsoDow, type JohnDef } from '@app/core';
import { CalendarIcon } from 'lucide-react-native';

import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { useWords } from '@/hooks/use-words';

/**
 * Week's "Coming up": the Johns that come round every few weeks or months
 * and land in the next four weeks, with when and how often. Nobody's name
 * is on them until the deal hands each out in its week. Nothing at all when
 * there are none.
 */
export function ComingUpSection({ johns, startsOn, weekStarts }: { johns: readonly JohnDef[]; startsOn: string; weekStarts: IsoDow }) {
  const words = useWords();
  const rows = comingUp(johns, startsOn, weekStarts, words);
  if (rows.length === 0) return null;
  return (
    <Section label={words('house.repeat.comingUp')} right={words('house.repeat.comingUpNote')} testID="coming-up">
      <Group>
        {rows.map((r) => (
          <Row
            key={r.johnId}
            leading={<RowIcon icon={CalendarIcon} />}
            title={r.name}
            meta={r.meta}
            trailing={pointsLabel(r.points)}
            testID="coming-up-john"
          />
        ))}
      </Group>
    </Section>
  );
}

import { PASS_FREE_HISTORY_WEEKS, passLine, passWords } from '@app/core';
import { LockIcon, TicketIcon } from 'lucide-react-native';

import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import type { HouseView } from '@/hooks/use-house';
import { useWords } from '@/hooks/use-words';

/**
 * The House Pass on House: one row with where the house stands (Founding,
 * the free month's days left, when it renews), pushing the Pass page.
 */
export function PassSection({ view }: { view: HouseView }) {
  const words = useWords();
  const { house, rules } = view.snapshot;
  const sign = passWords(house.kind, PASS_FREE_HISTORY_WEEKS, words);
  return (
    <Section label={sign.title} right={sign.sectionNote} testID="pass-section">
      <Row
        leading={<RowIcon icon={TicketIcon} />}
        title={sign.title}
        meta={passLine(house.pass, view.now, rules.timezone, words)}
        href="/house/pass"
        chevron
        testID="to-pass"
      />
    </Section>
  );
}

/** Where an extra was, for a house without the Pass once it's enforced: one row to the Pass page. */
export function PassLocked({ label, feature, testID }: { label: string; feature: string; testID?: string }) {
  const words = useWords();
  return (
    <Section label={label} testID={testID}>
      <Row
        leading={<RowIcon icon={LockIcon} />}
        title={words('house.pass.locked', { feature })}
        meta={words('house.pass.unlock')}
        href="/house/pass"
        chevron
      />
    </Section>
  );
}

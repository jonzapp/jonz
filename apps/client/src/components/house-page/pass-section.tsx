import { PASS_COPY, PASS_FREE_HISTORY_WEEKS, passLine, passWords } from '@app/core';
import { LockIcon, TicketIcon } from 'lucide-react-native';

import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import type { HouseView } from '@/hooks/use-house';

/**
 * The House Pass on House: one row with where the house stands (Founding,
 * the free month's days left, when it renews), pushing the Pass page.
 */
export function PassSection({ view }: { view: HouseView }) {
  const { house, rules } = view.snapshot;
  const words = passWords(house.kind, PASS_FREE_HISTORY_WEEKS);
  return (
    <Section label={words.title} right={words.sectionNote} testID="pass-section">
      <Row
        leading={<RowIcon icon={TicketIcon} />}
        title={words.title}
        meta={passLine(house.pass, view.now, rules.timezone)}
        href="/house/pass"
        chevron
        testID="to-pass"
      />
    </Section>
  );
}

/** Where an extra was, for a house without the Pass once it's enforced: one row to the Pass page. */
export function PassLocked({ label, feature, testID }: { label: string; feature: string; testID?: string }) {
  return (
    <Section label={label} testID={testID}>
      <Row
        leading={<RowIcon icon={LockIcon} />}
        title={PASS_COPY.locked(feature)}
        meta={PASS_COPY.unlock}
        href="/house/pass"
        chevron
      />
    </Section>
  );
}

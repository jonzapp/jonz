import { ADMIN_MORE, ADMIN_PAGES, ADMIN_TABS } from '@app/core';

import { ADMIN_ICON } from '@/components/admin/admin-shell';
import { Row, RowIcon } from '@/components/row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TitleBar } from '@/components/title-bar';

/** On a phone, the owner's pages that don't have a tab of their own. */
export default function MorePage() {
  return (
    <Screen bar={<TitleBar title={ADMIN_MORE.label} />} testID="admin-more">
      <Section label={ADMIN_MORE.label}>
        {ADMIN_PAGES.filter((p) => !ADMIN_TABS.includes(p.key)).map((p) => (
          <Row key={p.key} title={p.label} leading={<RowIcon icon={ADMIN_ICON[p.key]} />} href={p.path as never} chevron testID={`admin-more-${p.key}`} />
        ))}
      </Section>
    </Screen>
  );
}

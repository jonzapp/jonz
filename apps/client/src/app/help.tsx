import { HELP_PAGE, PAGE_TITLE } from '@app/core';

import { LegalPage } from '@/components/legal/legal-page';

/**
 * jonz.app/help: how to reach Jonz, from inside the app or by email, open
 * to anyone (docs/specs/report-a-problem.md, step 2). The README and
 * CONTRIBUTING send people here instead of GitHub issues.
 */
export default function Help() {
  return <LegalPage page={HELP_PAGE} tab={PAGE_TITLE.help} testID="help-screen" />;
}

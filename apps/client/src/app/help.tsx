import { HELP_PAGE } from '@app/core';

import { LegalPage } from '@/components/legal/legal-page';
import { useWords } from '@/hooks/use-words';

/**
 * jonz.app/help: how to reach Jonz, from inside the app or by email, open
 * to anyone (docs/specs/report-a-problem.md, step 2). The README and
 * CONTRIBUTING send people here instead of GitHub issues.
 */
export default function Help() {
  const words = useWords();
  return <LegalPage page={HELP_PAGE} tab={words('common.title.help')} testID="help-screen" />;
}

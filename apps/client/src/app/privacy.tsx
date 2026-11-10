import { PRIVACY_POLICY } from '@app/core';

import { LegalPage } from '@/components/legal/legal-page';
import { useWords } from '@/hooks/use-words';

/** jonz.app/privacy: what Jonz keeps, who sees it and how to delete it. Google, Microsoft, Apple, Stripe and the stores link here. */
export default function Privacy() {
  const words = useWords();
  return <LegalPage page={PRIVACY_POLICY} tab={words('common.title.privacy')} testID="privacy-screen" />;
}

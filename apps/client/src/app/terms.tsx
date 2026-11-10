import { TERMS } from '@app/core';

import { LegalPage } from '@/components/legal/legal-page';
import { useWords } from '@/hooks/use-words';

/** jonz.app/terms: the Terms of Service, the House Pass's included. Google, Microsoft, Apple, Stripe and the stores link here. */
export default function Terms() {
  const words = useWords();
  return <LegalPage page={TERMS} tab={words('common.title.terms')} testID="terms-screen" />;
}

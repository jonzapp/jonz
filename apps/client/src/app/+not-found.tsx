import { PAGE_TITLE } from '@app/core';

import { Button } from '@/components/button';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { useMembership } from '@/hooks/use-membership';
import { useWords } from '@/hooks/use-words';

/**
 * A link to nowhere, as the web's not-found page, on the front door's
 * pavement: say so, and the way back. Signed in, that's your Johns; signed
 * out, there are none yet, so it's the front door.
 */
export default function NotFound() {
  const words = useWords();
  const { session } = useMembership();
  return (
    <Door testID="not-found-screen">
      <PageTitle page={PAGE_TITLE.notFound} />
      <Sign>
        <SignHeading title={words('door.notFound.title')} body={words('door.notFound.body')} />
        <Button href="/" label={session ? words('door.notFound.back') : words('door.notFound.backToDoor')} />
      </Sign>
    </Door>
  );
}

import { STYLE_PAGE } from '@/components/style-page/enabled';
import { OwnerAskSample } from '@/components/style-page/owner-ask';

import NotFound from '../+not-found';

/**
 * /style/owner: the owner's Ask Jonz with a sample chat, as the admin pages
 * will show it. Hidden like /style: production shows the not-found page.
 */
export default function StyleOwner() {
  return STYLE_PAGE ? <OwnerAskSample /> : <NotFound />;
}

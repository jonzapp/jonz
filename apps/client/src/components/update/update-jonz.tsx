import { SHARE_SITE } from '@app/core';
import { ExternalLinkIcon } from 'lucide-react-native';
import { Linking, Platform } from 'react-native';

import { storeUrl } from '@/api/too-old';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { useWords } from '@/hooks/use-words';

/**
 * The version gate's screen (docs/specs/api.md, C6): the API has said this
 * phone's build is too old, so the whole app gives way to this until it's
 * updated. On the front door's pavement, as a page before the house: the way
 * to the store, and the web meanwhile, which always runs the latest build.
 * Without a store to send you to (an iPhone build before the App Store
 * listing), only the web.
 */
export function UpdateJonz({ store = storeUrl() }: { store?: string | null }) {
  const words = useWords();
  return (
    <Door home testID="update-jonz">
      <Sign>
        <SignHeading title={words('common.update.title')} body={words('common.update.body')} />
        <ButtonRow>
          {store ? (
            <Button
              label={words('common.update.store', { store: Platform.OS === 'ios' ? 'ios' : 'android' })}
              icon={ExternalLinkIcon}
              onPress={() => void Linking.openURL(store)}
              testID="update-store"
            />
          ) : null}
          <Button
            label={words('common.update.web')}
            variant={store ? 'outline' : 'primary'}
            onPress={() => void Linking.openURL(SHARE_SITE)}
            testID="update-web"
          />
        </ButtonRow>
      </Sign>
    </Door>
  );
}

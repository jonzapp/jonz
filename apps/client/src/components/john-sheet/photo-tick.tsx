import { CameraIcon, ImagesIcon } from 'lucide-react-native';

import { Button } from '@/components/button';
import type { useTick } from '@/hooks/use-tick';
import { useWords } from '@/hooks/use-words';

/**
 * The two ways to tick a John that needs a photo: take one now (the main
 * button, with the sheet's own label) or pick one from the library.
 */
export function PhotoTick({ tick, label, testID }: { tick: ReturnType<typeof useTick>; label: string; testID: string }) {
  const words = useWords();
  return (
    <>
      <Button
        icon={CameraIcon}
        label={label}
        busy={tick.waiting === 'camera'}
        busyLabel={tick.busyLabel}
        disabled={tick.held('camera')}
        onPress={() => void tick.tickWithPhoto('camera')}
        testID={testID}
      />
      <Button
        variant="outline"
        icon={ImagesIcon}
        label={words('john.sheet.fromLibrary')}
        busy={tick.waiting === 'library'}
        busyLabel={tick.busyLabel}
        disabled={tick.held('library')}
        onPress={() => void tick.tickWithPhoto('library')}
      />
    </>
  );
}

import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** A ScrollView's onScroll that calls `onNearEnd` once a scroll comes within a screen of the end, where a long list shows its next part. */
export function nearEnd(onNearEnd?: () => void) {
  return onNearEnd
    ? ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (contentOffset.y + 2 * layoutMeasurement.height >= contentSize.height) onNearEnd();
      }
    : undefined;
}

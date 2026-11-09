import { useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { OutlineBar } from '@/components/outline';
import { PHOTO_FADE, useTheme } from '@/theme';

/**
 * A photo (a Wall photo, a receipt, a report's screenshot) that holds its
 * space while it loads (docs/style/states.md, "Waiting"): a box at the
 * photo's size in the outline's tint, breathing with every other outline,
 * then the photo fades in over PHOTO_FADE ms (at once with reduced motion),
 * so nothing below it moves. `uri` may come later (a signed link still on
 * its way); until then the box waits. A photo that can't load leaves the box,
 * still. Size it with `style` (a width and an `aspectRatio`, or a height),
 * corners too; it clips the photo to them.
 */
export function Photo(props: PhotoProps) {
  // A new photo in the same place starts again from the box.
  return <PhotoBox key={props.uri ?? ''} {...props} />;
}

interface PhotoProps {
  uri: string | null | undefined;
  /** What the photo shows, for a screen reader. */
  label: string;
  style?: StyleProp<ViewStyle>;
  onCard?: boolean;
  testID?: string;
}

function PhotoBox({ uri, label, style, onCard = true, testID }: PhotoProps) {
  const { colors, scheme } = useTheme();
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [fade] = useState(() => new Animated.Value(0));

  const loaded = () => {
    setState('loaded');
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) fade.setValue(1);
        else Animated.timing(fade, { toValue: 1, duration: PHOTO_FADE, useNativeDriver: Platform.OS !== 'web' }).start();
      });
  };

  const tint = onCard && scheme !== 'dark' ? colors.secondary : colors.border;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      aria-busy={state === 'loading'}
      {...(Platform.OS === 'web' ? ({ dataSet: { photo: state } } as object) : {})}
      style={[styles.box, state === 'failed' ? { backgroundColor: tint } : null, style]}
    >
      {state === 'loading' ? <OutlineBar width="100%" height="100%" radius={0} onCard={onCard} style={StyleSheet.absoluteFill} /> : null}
      {uri ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Image
            source={{ uri }}
            resizeMode="cover"
            onLoad={loaded}
            onError={() => setState('failed')}
            style={styles.image}
            testID={testID ? `${testID}-image` : undefined}
            aria-hidden
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});

import { initials } from '@app/core';
import { useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import { useFadeIn } from '@/components/photo';
import { useOnTint } from '@/components/row';
import { usePhoto } from '@/hooks/photos';
import { HAIR, useTheme } from '@/theme';

/** Initials are never smaller than 12, so neither is a plate smaller than this. */
const SMALLEST = 24;

/**
 * A housemate on a round plate: the photo from the account they signed in
 * with (Google's, or Microsoft's), found by `userId` among the house's
 * people. Without one, or while it won't load, their initials: theirs on the
 * neutral tint (on the card colour where the row itself is tinted, so the
 * plate still shows), yours on an ink plate with light letters (never
 * amber). 32 in a row's leading slot, 24 in a header, and never smaller
 * than 24.
 */
export function Avatar({
  name,
  userId,
  me = false,
  size: asked = 32,
}: {
  name: string;
  userId?: string | null;
  me?: boolean;
  size?: number;
}) {
  const { colors, type } = useTheme();
  const onTint = useOnTint();
  const size = Math.max(asked, SMALLEST);
  const photo = usePhoto(userId);
  // The address that failed, so a new photo gets its own try.
  const [broken, setBroken] = useState<string | null>(null);
  const showPhoto = photo !== null && photo !== broken;
  return (
    <View
      aria-hidden
      testID={me ? 'avatar-me' : 'avatar'}
      style={[
        styles.plate,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: me ? colors.foreground : onTint ? colors.card : colors.secondary,
        },
      ]}
    >
      {/* The initials hold the plate until the photo has loaded and faded in over them. */}
      <Text style={[type.initials, styles.letters, { color: me ? colors.card : colors.secondaryForeground }]}>{initials(name)}</Text>
      {showPhoto ? <FadingPhoto key={photo} uri={photo} size={size} onError={() => setBroken(photo)} /> : null}
    </View>
  );
}

/** The plate's photo, over the initials, fading in once it has loaded (`useFadeIn`). */
function FadingPhoto({ uri, size, onError }: { uri: string; size: number; onError: () => void }) {
  const { opacity, show } = useFadeIn();
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image
        testID="avatar-photo"
        source={{ uri }}
        // Google's photo addresses refuse some pages that send a referrer.
        referrerPolicy="no-referrer"
        onLoad={show}
        onError={onError}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  plate: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // Overpass's caps sit high in their line, so the letters come down a little.
  letters: { paddingTop: HAIR },
});

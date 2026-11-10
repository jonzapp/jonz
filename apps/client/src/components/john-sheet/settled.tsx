import { type BoardItem } from '@app/core';
import { StyleSheet } from 'react-native';

import { usePhoto } from '@/hooks/use-wall';
import { RADIUS, useTheme } from '@/theme';
import { Photo } from '@/components/photo';

import type { JohnSheetContext } from './body';
import { SheetLines } from './parts';
import { useWords } from '@/hooks/use-words';

/**
 * A settled John: the header has said what happened, so all that's left is
 * the photo receipt, if it had one. A John being checked shows it too, above
 * Undo or Dispute.
 */
export function Settled({ item, context }: { item: BoardItem; context: JohnSheetContext }) {
  if (!item.photoPath) return null;
  return (
    <SheetLines>
      <Receipt item={item} path={item.photoPath} houseId={context.houseId} />
    </SheetLines>
  );
}

/** The receipt, signed for the sheet on its own. Nothing while it's signed, or when it can't be (gone from storage). */
function Receipt({ item, path, houseId }: { item: BoardItem; path: string; houseId: string }) {
  const words = useWords();
  const { colors } = useTheme();
  const photo = usePhoto(houseId, path);
  // Its space is held while it's signed and while it loads; gone from storage, nothing.
  if (photo.isError) return null;
  return (
    <Photo uri={photo.data} label={words('wall.page.photoOf', { john: item.name })} style={[styles.photo, { borderColor: colors.border }]} testID="sheet-photo" />
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, maxHeight: 384, borderRadius: RADIUS, borderWidth: 1 },
});

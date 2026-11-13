import { StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Section } from '@/components/section';
import { ReactionButtons } from '@/components/wall/reaction-buttons';
import { useReact, useWallFeed, wallPages } from '@/hooks/use-wall';
import { useWords } from '@/hooks/use-words';
import { INSET, SPACE } from '@/theme';

import type { JohnSheetContext } from './body';
import { SheetSection } from './parts';

/**
 * The Wall post's reactions, when the sheet was opened from one: the four,
 * live from the Wall as it's read, so giving one here shows on the row
 * behind. Nothing for a post the Wall no longer has in hand.
 */
export function PostReactions({ context }: { context: JohnSheetContext }) {
  if (!context.post) return null;
  return <Reactions post={context.post} houseId={context.houseId} userId={context.userId} />;
}

function Reactions({ post, houseId, userId }: { post: string; houseId: string; userId: string }) {
  const words = useWords();
  const feed = useWallFeed(houseId, userId);
  const { react, problem, problemAt } = useReact(houseId, userId);
  const event = wallPages(feed.data?.pages ?? []).events.find((e) => e.id === post);
  if (!event) return null;
  return (
    <SheetSection>
      {/* On the sheet, not in a card, at the gutter as the sheet's other buttons are. */}
      <Section label={words('wall.feed.reactions')} bare testID="john-reactions">
        <View style={styles.lines}>
          {problem && problemAt === post ? <Alert message={problem} /> : null}
          <ReactionButtons reactions={event.reactions} onReact={(kind, on) => react(post, kind, on)} />
        </View>
      </Section>
    </SheetSection>
  );
}

const styles = StyleSheet.create({
  lines: { paddingHorizontal: INSET, gap: SPACE.sm },
});

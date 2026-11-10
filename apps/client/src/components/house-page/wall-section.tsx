import { wallFeedRow } from '@app/core';
import { useState } from 'react';
import { View } from 'react-native';

import { GroupItem } from '@/components/group';
import { useJohnSheet } from '@/components/john-sheet';
import { ReadFailed } from '@/components/read-state';
import { Section } from '@/components/section';
import { Body } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { WallEventSheet } from '@/components/wall/event-sheet';
import { WallEventRow, wallScene } from '@/components/wall/wall-row';
import type { HouseView } from '@/hooks/use-house';
import { useReact, useWallLatest } from '@/hooks/use-wall';
import { TourSpot } from '@/components/tour/tour-spot';
import { Waiting } from '@/components/waiting';
import { OutlineRows } from '@/components/outline';
import { useWords } from '@/hooks/use-words';

/** How many of the Wall's events House shows. */
const LATEST = 4;

/**
 * House's third section, the Wall: its latest four events as rows, a
 * housemate's tick with its "Nice one", and "See all" for the whole Wall.
 * Tapping a row about this week's John opens it in the John sheet (at the
 * vote, while a dispute waits on you); any other opens the event in full.
 * Holding a row down shows it with all four reactions.
 */
export function WallSection({ houseId, userId, view }: { houseId: string; userId: string; view: HouseView }) {
  const words = useWords(view.snapshot.house.kind);
  const johnSheet = useJohnSheet();
  const latest = useWallLatest(houseId, userId, LATEST);
  const { react, problem, problemAt, clear } = useReact(houseId, userId);
  const [open, setOpen] = useState<string | null>(null);

  const events = latest.data?.events ?? [];
  const scene = wallScene(view, userId, events, words);
  const rows = events.map((event) => wallFeedRow(event, scene, words));
  const shown = open ? rows.find((r) => r.id === open) : undefined;
  // Its event has gone from the latest (a newer one pushed it off): put the sheet away.
  if (open && latest.data && !shown) setOpen(null);

  function show(eventId: string) {
    // Another event's refusal stays with that event's row, not in this sheet.
    if (problemAt !== eventId) clear();
    setOpen(eventId);
  }

  const seeAll = (
    <View testID="to-wall">
      <TextButton
        label={words('wall.feed.seeAll')}
        accessibilityLabel={words('wall.feed.seeAllOf', { wall: words('wall.page.title') })}
        href="/house/wall"
        align="end"
      />
    </View>
  );

  return (
    // Round the section, not inside it: tests and layouts reach its children.
    <TourSpot id="house.wall">
      <View testID="wall-section">
        <Section label={words('wall.page.title')} right={seeAll}>
          {!latest.data ? (
            latest.isError ? (
              <GroupItem>
                <ReadFailed message={words('wall.feed.unreadable')} onRetry={() => void latest.refetch()} />
              </GroupItem>
            ) : (
              <Waiting ready={false} label={words('wall.feed.reading')} outline={<OutlineRows count={LATEST} />} />
            )
          ) : rows.length === 0 ? (
            <GroupItem>
              <Body>{words('wall.page.empty')}</Body>
            </GroupItem>
          ) : (
            rows.map((row) => (
              <WallEventRow
                key={row.id}
                row={row}
                problem={problemAt === row.id && open !== row.id ? problem : null}
                onReact={(kind, on) => react(row.id, kind, on)}
                onPress={() =>
                  row.board ? johnSheet.open(row.board.assignmentId, row.board.vote ? 'vote' : undefined) : show(row.id)
                }
                onReactions={() => show(row.id)}
              />
            ))
          )}
        </Section>
        <WallEventSheet
          row={shown ?? null}
          problem={shown && problemAt === shown.id ? problem : null}
          onReact={(kind, on) => shown && react(shown.id, kind, on)}
          onClose={() => setOpen(null)}
        />
      </View>
    </TourSpot>
  );
}

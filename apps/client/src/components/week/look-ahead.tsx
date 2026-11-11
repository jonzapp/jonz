import { pointsLabel, type AheadSection, type TurnRow, type WaitingRow } from "@app/core";
import { HourglassIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { Row, RowIcon } from "@/components/row";
import { Section } from "@/components/section";
import { Meta } from "@/components/text";
import { INSET, LABEL_GAP } from "@/theme";
import { useWords } from '@/hooks/use-words';

/**
 * Week's look ahead in Steady weeks, from what the deal kept: the Johns
 * waiting their turn (each with when its turn comes), whose turn is next
 * for the Johns not out this week (Smart), and Classic's next two weeks,
 * person by person. Each is nothing when it has nothing to show.
 */
export function WaitingSection({ rows }: { rows: readonly WaitingRow[] }) {
  const words = useWords();
  if (rows.length === 0) return null;
  return (
    <View style={styles.noted}>
      <Section label={words('week.steady.waiting')} testID="week-waiting">
        {rows.map((r) => (
          <Row
            key={r.johnId}
            leading={<RowIcon icon={HourglassIcon} />}
            title={r.name}
            meta={r.meta}
            trailing={pointsLabel(r.points, words)}
            testID="waiting-john"
          />
        ))}
      </Section>
      <Meta style={styles.note}>{words('week.steady.waitingNote')}</Meta>
    </View>
  );
}

/** Smart: the Johns not out this week, with whose turn they are and when. */
export function TurnsNextSection({
  rows,
  userId,
  nameOf,
}: {
  rows: readonly TurnRow[];
  /** Who's looking. */
  userId: string;
  nameOf: (userId: string) => string | null;
}) {
  const words = useWords();
  if (rows.length === 0) return null;
  return (
    <Section label={words('week.steady.turnsNext')} testID="week-turns-next">
      {rows.map((r) => (
        <Row
          key={r.johnId}
          leading={
            <Avatar
              name={nameOf(r.userId) ?? ""}
              userId={r.userId}
              me={r.userId === userId}
              size={30}
            />
          }
          title={r.name}
          meta={r.meta}
          trailing={pointsLabel(r.points, words)}
          testID="turn-next"
        />
      ))}
    </Section>
  );
}

/** Classic: the next two weeks, a section each, one row a person with their Johns. */
export function AheadWeeks({
  sections,
  userId,
  nameOf,
}: {
  sections: readonly AheadSection[];
  userId: string;
  nameOf: (userId: string) => string | null;
}) {
  const words = useWords();
  return (
    <>
      {sections.map((s) => (
        <Section key={s.startsOn} label={s.label} testID="week-ahead">
          {s.people.map((p) => (
            <Row
              key={p.userId}
              leading={
                <Avatar
                  name={nameOf(p.userId) ?? p.who}
                  userId={p.userId}
                  me={p.userId === userId}
                  size={30}
                />
              }
              title={p.who}
              meta={p.johns.join(", ")}
              metaLines={2}
              trailing={pointsLabel(p.points, words)}
              testID="ahead-person"
            />
          ))}
        </Section>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  noted: { gap: LABEL_GAP },
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
});

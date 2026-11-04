import { HOUSES_COPY, houseFacts, houseLead, passDetail, personMeta, type HouseDetail } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ownerHouse } from '@/api/houses';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Lead, Meta } from '@/components/text';
import { SPACE, useTheme } from '@/theme';

/** The Houses list's reads, so the panel and the list share their cache. */
export const HOUSES_KEY = ['owner-houses'] as const;

/**
 * One house, read only: when it started and its admins, each person with
 * how they're doing and any time away, its Pass and who pays, and the
 * settings that help with a support email. Nothing here changes the house.
 */
export function HousePanel({ id }: { id: string }) {
  const { colors } = useTheme();
  const house = useQuery({ queryKey: [...HOUSES_KEY, 'house', id], queryFn: () => ownerHouse(id) });
  if (house.isPending) return <ActivityIndicator color={colors.mutedForeground} style={styles.wait} />;
  if (house.isError) return <Alert message={house.error.message} testID="house-panel-problem" />;
  if (!house.data) return <Meta>{HOUSES_COPY.gone}</Meta>;
  return <HouseBody house={house.data} />;
}

function HouseBody({ house }: { house: HouseDetail }) {
  const pass = passDetail(house, new Date());
  return (
    <View style={styles.panel} testID="house-panel">
      <View style={styles.head}>
        <Lead header>{house.name}</Lead>
        <Meta>{houseLead(house)}</Meta>
      </View>
      <Section label={HOUSES_COPY.people}>
        {house.people.map((person) => (
          <Row
            key={person.id}
            leading={<Avatar name={person.name} userId={person.id} />}
            title={person.name}
            meta={personMeta(person)}
            testID={`house-person-${person.id}`}
          />
        ))}
      </Section>
      <Section label={HOUSES_COPY.money}>
        <Row title={pass.title} meta={pass.meta} testID="house-pass" />
      </Section>
      <Section label={HOUSES_COPY.details}>
        <Row title={houseFacts(house)} titleLines={2} testID="house-facts" />
      </Section>
      <Meta>{HOUSES_COPY.readOnly}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  wait: { marginTop: SPACE.xl },
  panel: { gap: SPACE.xl },
  head: { gap: SPACE.xs },
});

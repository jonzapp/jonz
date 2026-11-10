import { promotionEnds, promotionGives, promotionMeta, PROMOTION_FACETS, PROMOTIONS_COPY, promotionUsed, promotionWho, type ListAsk, type PromotionRow } from '@app/core';
import { useRouter } from 'expo-router';
import { PlusIcon, TicketIcon, UsersIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { promotionFilter, promotionsCount, promotionsPage, PROMOTIONS_KEY, type PromotionCursor } from '@/api/promotions';
import { AdminSwitch } from '@/components/admin/admin-shell';
import { ownerZone } from '@/components/admin/audit-entry';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { PromotionForm } from '@/components/admin/promotion-form';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Row, RowIcon } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Chip } from '@/components/status-mark';
import { Lead } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { SPACE } from '@/theme';

/** Every promotion's columns on a laptop. */
const TABLE: readonly ListColumn[] = [
  { key: 'name', label: PROMOTIONS_COPY.columns.name, flex: 1 },
  { key: 'gives', label: PROMOTIONS_COPY.columns.gives, width: 200 },
  { key: 'who', label: PROMOTIONS_COPY.columns.who, width: 96 },
  { key: 'used', label: PROMOTIONS_COPY.columns.used, width: 88 },
  { key: 'ends', label: PROMOTIONS_COPY.columns.ends, width: 80, end: true },
];

/**
 * Promotions, list first, as Notices and Messages are: every promotion,
 * newest first, as a busy list (the one search box finds a name, a code or
 * an email on one, and filters by who it's for and how it stands), each
 * opening its page, with New promotion over it. On a laptop the new one is
 * filled in in the side panel; on a phone New promotion is a page of its
 * own. Someone whose app role can't make promotions (support) gets the
 * list alone.
 */
export default function PromotionsPage() {
  const busy = useBusyList({
    key: [...PROMOTIONS_KEY, 'all'],
    facets: PROMOTION_FACETS,
    rows: (cursor: PromotionCursor | null, ask: ListAsk) => promotionsPage(cursor, promotionFilter(ask)),
    count: (ask) => promotionsCount(promotionFilter(ask)),
  });
  return (
    <Screen spreads bar={<TitleBar title={PROMOTIONS_COPY.page} />} onNearEnd={busy.onNearEnd} testID="admin-promotions">
      <AdminSwitch page="promotions" />
      <Promotions busy={busy} />
    </Screen>
  );
}

function Promotions({ busy }: { busy: BusyList<PromotionRow> }) {
  const two = useColumns();
  const may = useOwnerMay('promotions:write');
  const router = useRouter();
  const zone = ownerZone();
  const open = (p: PromotionRow) => `/admin/promotions/${p.id}` as never;
  const beside = two && may;

  const list = (
    <>
      {/* On a laptop the form is already beside the list. */}
      {may && !beside ? (
        <ButtonRow atEdge>
          <Button label={PROMOTIONS_COPY.newPromotion} icon={PlusIcon} onPress={() => router.push('/admin/promotions/new' as never)} testID="promotion-new" />
        </ButtonRow>
      ) : null}
      <BusyListView
        busy={busy}
        name="promotions"
        placeholder={PROMOTIONS_COPY.searchPlaceholder}
        noun={PROMOTIONS_COPY.count}
        columns={TABLE}
        tableRow={(p) => (
          <ListTableRow
            key={p.id}
            columns={TABLE}
            cells={{ name: p.name, gives: promotionGives(p.terms), who: promotionWho(p), used: promotionUsed(p), ends: promotionEnds(p, zone) }}
            quiet={['who', 'ends']}
            strong={['name']}
            onPress={() => router.push(open(p))}
            accessibilityLabel={`${p.name}, ${promotionMeta(p)}`}
            testID={`promotion-${p.code}`}
          />
        )}
        row={(p) => (
          <Row
            key={p.id}
            leading={<RowIcon icon={p.audience === 'anyone' ? TicketIcon : UsersIcon} />}
            title={p.name}
            meta={promotionMeta(p)}
            metaLines={2}
            trailing={p.state === 'live' ? undefined : <Chip label={PROMOTIONS_COPY.stateChip[p.state]} />}
            href={open(p)}
            chevron
            testID={`promotion-${p.code}`}
          />
        )}
        empty={{ icon: TicketIcon, title: PROMOTIONS_COPY.nothing, body: PROMOTIONS_COPY.nothingBody }}
      />
    </>
  );

  if (!beside) return list;
  return (
    <Columns
      main={list}
      side={
        <View style={styles.side} testID="promotion-side">
          <Lead header>{PROMOTIONS_COPY.newPromotion}</Lead>
          <PromotionForm beside />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  side: { gap: SPACE.lg },
});

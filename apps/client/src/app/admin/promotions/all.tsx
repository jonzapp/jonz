import { promotionEnds, promotionGives, promotionMeta, PROMOTION_FACETS, PROMOTIONS_COPY, promotionUsed, promotionWho, type ListAsk, type PromotionRow } from '@app/core';
import { router } from 'expo-router';
import { TicketIcon, UsersIcon } from 'lucide-react-native';

import { promotionFilter, promotionsCount, promotionsPage, PROMOTIONS_KEY, type PromotionCursor } from '@/api/promotions';
import { BusyListView, useBusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Row, RowIcon } from '@/components/row';
import { Screen } from '@/components/screen';
import { Chip } from '@/components/status-mark';
import { TitleBar } from '@/components/title-bar';

/** Every promotion's columns on a laptop. */
const TABLE: readonly ListColumn[] = [
  { key: 'name', label: PROMOTIONS_COPY.columns.name, flex: 1 },
  { key: 'gives', label: PROMOTIONS_COPY.columns.gives, width: 200 },
  { key: 'who', label: PROMOTIONS_COPY.columns.who, width: 96 },
  { key: 'used', label: PROMOTIONS_COPY.columns.used, width: 88 },
  { key: 'ends', label: PROMOTIONS_COPY.columns.ends, width: 80, end: true },
];

/**
 * Every promotion, newest first, as a busy list: the one search box finds a
 * name, a code or an email on one, and filters by who it's for and how it
 * stands. Each opens its page.
 */
export default function AllPromotionsPage() {
  const busy = useBusyList({
    key: [...PROMOTIONS_KEY, 'all'],
    facets: PROMOTION_FACETS,
    rows: (cursor: PromotionCursor | null, ask: ListAsk) => promotionsPage(cursor, promotionFilter(ask)),
    count: (ask) => promotionsCount(promotionFilter(ask)),
    cursor: (row: PromotionRow) => ({ at: row.madeAt, id: row.id }),
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const open = (p: PromotionRow) => `/admin/promotions/${p.id}` as never;
  return (
    <Screen
      spreads
      bar={<TitleBar title={PROMOTIONS_COPY.all} back={'/admin/promotions' as never} backLabel={PROMOTIONS_COPY.page} />}
      onNearEnd={busy.onNearEnd}
      testID="admin-promotions-all"
    >
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
    </Screen>
  );
}

import { facetChoices, listAsk, listCount, listQueryFromParams, listQueryIsSet, listQueryToParams, type ListAsk, type ListFacet, type ListQuery, type ListWhen, type WhenPreset } from '@app/core';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { SearchXIcon, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { ListTable, ListTableHead, type ListColumn } from '@/components/list-table';
import { SmartSearch } from '@/components/admin/smart-search';
import { EmptyState } from '@/components/empty-state';
import { Group } from '@/components/group';
import { ListFoot, nearEnd, type ListMore } from '@/components/list-foot';
import { OutlineBar, OutlineRows } from '@/components/outline';
import { ReadFailed } from '@/components/read-state';
import { Section } from '@/components/section';
import { useColumns } from '@/components/screen';
import { Dimmed, SearchLine } from '@/components/search-line';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Waiting } from '@/components/waiting';
import { INSET, OUTLINE, SECTION_GAP, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** A page of a busy list, whether there's another after it, and (from /v1) where that one starts. */
export interface ListPage<T, C = unknown> {
  items: T[];
  more: boolean;
  next?: C | null;
}

/** What a busy list reads, from its own corner of the database. */
export interface BusyListSource<T, C> {
  /** Its name in the cache; anything else its reads depend on (whose account "You" is) goes after it. */
  key: readonly unknown[];
  facets: readonly ListFacet[];
  defaultWhen?: WhenPreset;
  /** What the list calls When (Deletions: Asked), and whether a moment starts it. */
  when?: ListWhen;
  /** A page of rows after `cursor` (null for the first), narrowed as `ask` says. */
  rows: (cursor: C | null, ask: ListAsk) => Promise<ListPage<T, C>>;
  /** How many rows match `ask`. */
  count: (ask: ListAsk) => Promise<number>;
  /** Where the next page starts, when the page doesn't say: the last row's cursor. */
  cursor?: (last: T) => C;
}

/**
 * Every admin list's reading, shared: the query from the page's address,
 * the window When makes from the moment it was asked, the rows 50 at a time
 * as you scroll, the count of what matches, and a way to ask again. A page
 * says only where its rows come from; BusyList draws them.
 */
export function useBusyList<T, C>(source: BusyListSource<T, C>) {
  const params = useLocalSearchParams();
  const defaultWhen = source.defaultWhen ?? 'any';
  const query = listQueryFromParams(params, facetChoices(source.facets), defaultWhen);
  const shown = listQueryToParams(query, defaultWhen);
  const key = JSON.stringify(shown);
  // The last hour is the hour before you asked, however long you scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new question, a new moment
  const asked = useMemo(() => new Date(), [key]);
  const ask = listAsk(query, asked, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const list = useInfiniteQuery({
    queryKey: [...source.key, 'rows', key],
    queryFn: ({ pageParam }) => source.rows(pageParam as C | null, ask),
    initialPageParam: null as C | null,
    getNextPageParam: (last: ListPage<T, C>): C | null => {
      if (!last.more) return null;
      if (last.next !== undefined) return last.next;
      return last.items.length > 0 && source.cursor ? source.cursor(last.items[last.items.length - 1]) : null;
    },
    // While a new search reads, the last one's rows stay, so the list doesn't blink as you type.
    placeholderData: keepPreviousData,
  });
  const count = useQuery({ queryKey: [...source.key, 'count', key], queryFn: () => source.count(ask), placeholderData: keepPreviousData });
  const more: ListMore = {
    has: list.hasNextPage,
    busy: list.isFetchingNextPage,
    failed: list.isFetchNextPageError,
    load: () => void list.fetchNextPage(),
  };
  const names = ['q', ...source.facets.map((facet) => facet.key), 'when', 'from'];
  /** Asks again by address (Show more like this): what's set goes in it, and nothing for what isn't. */
  const show = (set: Record<string, string>) => router.setParams(Object.fromEntries(names.map((name) => [name, set[name]])));
  const setQuery = (next: ListQuery) => show(listQueryToParams(next, defaultWhen));
  return {
    query,
    /** What's asked, as the rows and count read it, and its key: for a page that counts more about the same question. */
    ask,
    askKey: key,
    setQuery,
    show,
    defaultWhen,
    facets: source.facets,
    when: source.when ?? {},
    list,
    items: list.data?.pages.flatMap((page) => page.items) ?? [],
    count: count.data ?? null,
    /** A new search or filter is reading: the last one's rows and count are still shown. */
    searching: list.isPlaceholderData || count.isPlaceholderData,
    more,
    narrowed: listQueryIsSet(query, defaultWhen),
    /** The Screen's onNearEnd, once the first page is in. */
    onNearEnd: list.data ? nearEnd(more) : undefined,
  };
}

export type BusyList<T> = ReturnType<typeof useBusyList<T, unknown>>;

/** A group of a busy list's rows: its name, how many the whole list has in it (null until counted), and the rows read so far. */
export interface ListGroup<T> {
  key: string;
  label: string;
  count: number | null;
  items: T[];
}

/**
 * Every admin list, drawn the same way: the one search box, the count of
 * what matches with Clear, then the rows (a table on a laptop, Rows on a
 * phone), and the foot every long list has. Nothing matching says so, with
 * Clear; an empty list says what will fill it.
 */
export function BusyListView<T>({
  busy,
  name,
  placeholder,
  noun,
  columns,
  tableRow,
  row,
  empty,
  foot,
  groups,
}: {
  busy: BusyList<T>;
  /** The list's name in test ids and its recent searches: "audit". */
  name: string;
  placeholder: string;
  /** "2,481 entries". */
  noun: (count: string) => string;
  columns: readonly ListColumn[];
  tableRow: (item: T) => ReactNode;
  row: (item: T) => ReactNode;
  empty: { icon: LucideIcon; title: string; body: string };
  /** What the foot says is shown, when the count isn't in yet: how far back. */
  foot?: (last: T) => string;
  /**
   * The rows in groups, each under its name and count ("Needs a reply, 2"),
   * in order; a group with no rows is left out. Null draws them as one list.
   */
  groups?: (items: T[]) => readonly ListGroup<T>[] | null;
}) {
  const words = useWords();
  const wide = useColumns();
  const { colors } = useTheme();
  // Typed, and waiting for the pause before it searches: already "searching", so it shows at once.
  const [typing, setTyping] = useState(false);
  const searching = typing || busy.searching;
  // On a laptop the search, the count and the column names stay in view at the top as the rows scroll under them.
  // Sticky is the web's, as the foot's is.
  const pinned = wide && Platform.OS === 'web';
  const grouped = groups?.(busy.items)?.filter((group) => group.items.length > 0) ?? null;
  // In groups, each group is a table of its own, the column names over the first.
  const table = !grouped && wide && !busy.list.isPending && !busy.list.isError && busy.items.length > 0;
  const head = (
    <>
      {/* The search box with its line under it, as one: the line takes no gap of its own. */}
      <View style={styles.search}>
        <SmartSearch
          query={busy.query}
          facets={busy.facets}
          onChange={busy.setQuery}
          placeholder={placeholder}
          recentKey={`admin-recent-${name}`}
          defaultWhen={busy.defaultWhen}
          when={busy.when}
          testID={`${name}-search`}
          searching={busy.searching}
          onPending={setTyping}
        />
        <SearchLine searching={searching} label={words('common.list.searching')} testID={`${name}-search-line`} />
      </View>
      <View style={styles.count} testID={`${name}-count`}>
        {searching && busy.count !== null ? (
          // Not the last search's count, which would pass for this one's.
          <Meta testID={`${name}-count-searching`}>{words('common.join.ongoing', { text: words('common.list.searching') })}</Meta>
        ) : busy.count === null ? (
          // The count's room while it's first read, in outline.
          <OutlineBar width={120} height={OUTLINE.meta} onCard={false} />
        ) : (
          <Meta>{noun(listCount(busy.count, false))}</Meta>
        )}
        {busy.narrowed ? <TextButton label={words('common.list.clear')} onPress={() => busy.show({})} testID={`${name}-clear`} /> : null}
      </View>
    </>
  );

  let body: ReactNode;
  if (busy.list.isPending)
    body = (
      <Waiting
        ready={false}
        label={words('common.list.reading')}
        outline={
          <Group>
            <OutlineRows count={8} lead={wide ? 'none' : 'circle'} end={wide} />
          </Group>
        }
      />
    );
  else if (busy.list.isError) body = <ReadFailed onRetry={() => void busy.list.refetch()} />;
  else if (busy.items.length === 0)
    body = busy.narrowed ? (
      <EmptyState icon={SearchXIcon} title={words('common.list.noMatch')} body={words('common.list.noMatchBody')} testID={`${name}-no-match`} />
    ) : (
      <EmptyState icon={empty.icon} title={empty.title} body={empty.body} testID={`${name}-empty`} />
    );
  else {
    const last = busy.items[busy.items.length - 1];
    body = (
      <>
        {grouped ? (
          <View style={styles.groups}>
            {grouped.map((group, i) => (
              <Section key={group.key} label={`${group.label}, ${listCount(group.count ?? group.items.length, false)}`} bare={wide} testID={`${name}-group-${group.key}`}>
                {wide ? (
                  <ListTable columns={columns} head={i === 0}>
                    {group.items.map(tableRow)}
                  </ListTable>
                ) : (
                  group.items.map(row)
                )}
              </Section>
            ))}
          </View>
        ) : wide ? (
          <ListTable columns={columns} head={false} testID={`${name}-table`}>
            {busy.items.map(tableRow)}
          </ListTable>
        ) : (
          <Group testID={`${name}-rows`}>{busy.items.map(row)}</Group>
        )}
        <ListFoot
          more={busy.more}
          shown={busy.count !== null ? words('common.list.of', { shown: busy.items.length, total: busy.count }) : (foot?.(last) ?? null)}
          testID={`${name}-foot`}
        />
      </>
    );
  }
  return (
    <View style={styles.list}>
      <View style={[styles.top, styles.over, pinned && [STICKY_TOP, { backgroundColor: colors.background }]]} testID={`${name}-top`}>
        {head}
        {table ? <ListTableHead columns={columns} testID={`${name}-table-head`} /> : null}
      </View>
      {/* A new search's rows on their way: the last ones dimmed, so they don't pass for the answer. */}
      <Dimmed searching={searching} style={styles.list}>
        {table ? <View style={styles.joined}>{body}</View> : body}
      </Dimmed>
    </View>
  );
}

// React Native's types stop at absolute; the web's sticky keeps the top in view as the column scrolls.
const STICKY_TOP = { position: 'sticky', top: 0, zIndex: 1 } as unknown as ViewStyle;

const styles = StyleSheet.create({
  groups: { gap: SECTION_GAP },
  list: { gap: SPACE.sm },
  // Pinned, it keeps a little room under the title bar; unpinned, the room is taken back above it.
  top: { gap: SPACE.sm, marginTop: -SPACE.sm, paddingTop: SPACE.sm },
  // The rows meet the column names square, and the foot keeps its room under them.
  joined: { marginTop: -SPACE.sm, gap: SPACE.sm },
  // The search's suggestions float over the rows, so the top sits above them.
  over: { zIndex: 1 },
  search: { zIndex: 2 },
  count: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md, minHeight: 32, paddingHorizontal: INSET },
});

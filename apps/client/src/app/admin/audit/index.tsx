import { ADMIN_COPY, AUDIT_FACETS, AUDIT_LIST_COPY, listTime, type AuditEntry } from '@app/core';
import { router } from 'expo-router';
import { ScrollTextIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { auditCount, auditFilter, auditPage } from '@/api/owner';
import { AUDIT_TABLE, AuditDetail, AuditRow, AuditTableRow, ownerZone } from '@/components/admin/audit-entry';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { Columns, Screen, useColumns } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { useMembership } from '@/hooks/use-membership';
import { useNow } from '@/hooks/use-now';
import { AdminSwitch } from '@/components/admin/admin-shell';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * The audit log, built for thousands of entries a day: no day headings, one
 * row an entry with its time (and its date, before today), newest first.
 * It is a busy list like every admin list: one search box, the database
 * doing the narrowing 50 rows at a time as you scroll, and a count of what
 * matches. On a laptop the rows are a table and the entry chosen sits in
 * the side panel; on a phone they are rows and an entry opens as its own
 * page. Show more like this, on an entry, narrows the list to more of the
 * same.
 */
export default function AuditPage() {
  const ownerId = useMembership().session?.user.id ?? null;
  const busy = useBusyList({
    key: ['owner-audit', ownerId],
    facets: AUDIT_FACETS,
    rows: (cursor: string | null, ask) =>
      auditPage(cursor, auditFilter(ask, ownerId)).then((page) => ({ items: page.entries, more: page.more, next: page.next })),
    count: (ask) => auditCount(auditFilter(ask, ownerId)),
  });
  return (
    <Screen spreads bar={<TitleBar title="Audit log" />} onNearEnd={busy.onNearEnd} testID="admin-audit">
      <AdminSwitch page="audit" />
      <AuditLog busy={busy} ownerId={ownerId} />
    </Screen>
  );
}

/** The list, and on a laptop the entry chosen beside it. Inside the Screen, which knows whether there's room for two columns. */
function AuditLog({ busy, ownerId }: { busy: BusyList<AuditEntry>; ownerId: string | null }) {
  const words = useWords();
  const two = useColumns();
  const now = useNow();
  const [chosen, setChosen] = useState<number | null>(null);
  const shown = busy.items.find((entry) => entry.id === chosen) ?? busy.items[0];
  const open = (entry: AuditEntry) => (two ? setChosen(entry.id) : router.push(`/admin/audit/${entry.id}` as never));

  const list = (
    <BusyListView
      busy={busy}
      name="audit"
      placeholder={AUDIT_LIST_COPY.searchPlaceholder}
      noun={AUDIT_LIST_COPY.count}
      columns={AUDIT_TABLE}
      tableRow={(entry) => (
        <AuditTableRow
          key={entry.id}
          entry={entry}
          ownerId={ownerId}
          now={now}
          chosen={entry.id === shown?.id}
          onPress={() => open(entry)}
        />
      )}
      row={(entry) => <AuditRow key={entry.id} entry={entry} ownerId={ownerId} now={now} onPress={() => open(entry)} />}
      empty={{ icon: ScrollTextIcon, title: ADMIN_COPY.noAudit, body: ADMIN_COPY.noAuditBody }}
      foot={(last) => words('common.list.backTo', { day: listTime(last.at, now, ownerZone(), false) })}
    />
  );
  // On a laptop the list always sits in the main column, even with nothing to show beside it (nothing
  // matches, or the first read isn't in): moving it in or out of the columns would draw the search box
  // afresh and take the cursor out of it mid-word.
  if (!two) return list;
  return (
    <Columns
      main={list}
      side={
        shown ? (
          <AuditDetail
            entry={shown}
            ownerId={ownerId}
            onLikeThis={(like) => {
              setChosen(null);
              busy.show(like);
            }}
          />
        ) : (
          <View style={styles.none} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  none: { gap: SPACE.lg },
});

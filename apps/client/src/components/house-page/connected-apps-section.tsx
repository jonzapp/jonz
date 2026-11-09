import { CONNECTED_APPS_COPY, dayLabel } from '@app/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugIcon } from 'lucide-react-native';
import { useState } from 'react';

import { connectedApps, disconnectApp } from '@/api/connected-apps';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { TextButton } from '@/components/text-button';

const KEY = ['connected-apps'] as const;

/**
 * Connected apps, on You: each app you've let use Jonz as you (an MCP client
 * signed in through Supabase's OAuth server), since when, and Disconnect,
 * which signs it out at once. Nothing connected says how one gets here.
 */
export function ConnectedAppsSection({ zone }: { zone: string }) {
  const client = useQueryClient();
  const apps = useQuery({ queryKey: KEY, queryFn: connectedApps });
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function disconnect() {
    if (!leaving) return;
    setBusy(true);
    setProblem(null);
    try {
      await disconnectApp(leaving.id);
      await client.invalidateQueries({ queryKey: KEY });
      setLeaving(null);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  // Unread (the OAuth server off, or offline): nothing to show, and nothing to say.
  if (!apps.data) return null;
  return (
    <Section label={CONNECTED_APPS_COPY.heading} testID="connected-apps">
      {apps.data.length === 0 ? (
        <Row leading={<RowIcon icon={PlugIcon} />} title={CONNECTED_APPS_COPY.none} testID="connected-apps-none" />
      ) : (
        apps.data.map((grant) => (
          <Row
            key={grant.client.id}
            leading={<RowIcon icon={PlugIcon} />}
            title={grant.client.name}
            meta={CONNECTED_APPS_COPY.since(dayLabel(new Date(grant.granted_at), zone))}
            trailing={
              <TextButton
                label={CONNECTED_APPS_COPY.disconnect}
                onPress={() => {
                  setProblem(null);
                  setLeaving({ id: grant.client.id, name: grant.client.name });
                }}
                testID="disconnect-app"
              />
            }
            testID="connected-app"
          />
        ))
      )}
      <ConfirmSheet
        visible={leaving !== null}
        title={CONNECTED_APPS_COPY.confirm(leaving?.name ?? '')}
        confirmLabel={busy ? CONNECTED_APPS_COPY.disconnecting : CONNECTED_APPS_COPY.disconnect}
        icon={PlugIcon}
        busy={busy}
        problem={problem}
        onConfirm={() => void disconnect()}
        onClose={() => setLeaving(null)}
        testID="disconnect-sheet"
      />
    </Section>
  );
}

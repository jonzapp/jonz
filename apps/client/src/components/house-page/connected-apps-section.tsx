import { dayLabel, DEFAULT_APP_ACCESS, type AppAccess } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugIcon } from 'lucide-react-native';
import { useState } from 'react';

import { appAccess, connectedApps, disconnectApp, setAppAccess } from '@/api/connected-apps';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { AppAccessChoice, useAppAccessWords } from '@/components/house-page/app-access-choice';
import { ConnectAssistant } from '@/components/house-page/connect-assistant';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { useToastIfAny } from '@/components/toast';
import { useWords } from '@/hooks/use-words';

const KEY = ['connected-apps'] as const;
const ACCESS_KEY = ['connected-apps', 'access'] as const;

interface App {
  id: string;
  name: string;
  since: string;
}

/**
 * Connected apps, on You: each app you've let use Jonz as you (an MCP client
 * signed in through Supabase's OAuth server), what it may do and since when.
 * Tapping one opens its sheet: Read only or Read and change, saved as you
 * pick, and Disconnect, which signs it out at once. Last, Connect your AI
 * assistant: each assistant's steps and the address to paste.
 */
export function ConnectedAppsSection({ zone }: { zone: string }) {
  const words = useWords();
  const say = useAppAccessWords();
  const toast = useToastIfAny();
  const client = useQueryClient();
  const apps = useQuery({ queryKey: KEY, queryFn: connectedApps });
  const access = useQuery({ queryKey: ACCESS_KEY, queryFn: appAccess, enabled: Boolean(apps.data?.length) });
  const [open, setOpen] = useState<App | null>(null);
  const [leaving, setLeaving] = useState<App | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const accessOf = (id: string): AppAccess => access.data?.[id] ?? DEFAULT_APP_ACCESS;

  const change = useMutation({
    mutationFn: ({ app, to }: { app: App; to: AppAccess }) => setAppAccess(app.id, to),
    onSuccess: async (_, { app, to }) => {
      client.setQueryData<Record<string, AppAccess>>(ACCESS_KEY, (was) => ({ ...was, [app.id]: to }));
      toast?.show(words('people.connectedApps.saved', { app: app.name, access: say.name(to).toLowerCase() }));
    },
  });

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
    <Section label={words('people.connectedApps.heading')} testID="connected-apps">
      {apps.data.map((grant) => {
        const app = { id: grant.client.id, name: grant.client.name, since: dayLabel(new Date(grant.granted_at), zone, words) };
        return (
          <Row
            key={app.id}
            leading={<RowIcon icon={PlugIcon} />}
            title={app.name}
            meta={words('people.connectedApps.since', { access: say.name(accessOf(app.id)), date: app.since })}
            chevron
            onPress={() => {
              change.reset();
              setOpen(app);
            }}
            testID="connected-app"
          />
        );
      })}
      <ConnectAssistant />
      <Sheet
        visible={open !== null}
        title={open?.name ?? ''}
        description={open ? words('people.appAccess.label', { app: open.name }) : undefined}
        onClose={() => setOpen(null)}
        testID="app-sheet"
      >
        {open ? (
          <>
            <AppAccessChoice value={change.isPending ? change.variables.to : accessOf(open.id)} onChange={(to) => change.mutate({ app: open, to })} disabled={change.isPending} />
            {change.error ? <Alert message={change.error.message} /> : null}
            <ButtonRow>
              <Button
                label={words('people.connectedApps.disconnect')}
                variant="outline"
                onPress={() => {
                  setProblem(null);
                  setOpen(null);
                  setLeaving(open);
                }}
                testID="disconnect-app"
              />
            </ButtonRow>
          </>
        ) : null}
      </Sheet>
      <ConfirmSheet
        visible={leaving !== null}
        title={words('people.connectedApps.confirm', { app: leaving?.name ?? '' })}
        confirmLabel={words('people.connectedApps.disconnect')}
        icon={PlugIcon}
        busy={busy}
        busyLabel={words('people.connectedApps.disconnecting')}
        problem={problem}
        onConfirm={() => void disconnect()}
        onClose={() => setLeaving(null)}
        testID="disconnect-sheet"
      />
    </Section>
  );
}

import { ADMIN_PAGES } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { Stack, usePathname } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ownerStatus } from '@/api/owner';
import { ADMIN_TAB_BAR, AdminShell } from '@/components/admin/admin-shell';
import { CodeGate } from '@/components/admin/code-gate';
import { OwnerAskDock, OwnerAskProvider, OwnerAskSheet } from '@/components/admin/owner-ask-panel';
import { OutlinePage } from '@/components/outline';
import { ToastProvider } from '@/components/toast';
import { Waiting } from '@/components/waiting';
import { CONTENT_MAX, GUTTER, SPACE, useTheme, WIDE } from '@/theme';

import NotFound from '../+not-found';

/**
 * The owner's pages (docs/specs/owner-admin.md). Anyone who isn't the owner
 * sees the app's Nothing here, as for any page that isn't there; the owner
 * passes their code first. The database checks both again on every read and
 * write, so this is the page being polite, not the lock. The sparkles on
 * every admin title bar open the owner's own Ask Jonz.
 */
export default function AdminLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE;
  const pathname = usePathname();
  const status = useQuery({ queryKey: ['owner-status'], queryFn: ownerStatus, staleTime: 60_000 });
  // Before the shell: whether you're an owner, on the page's ground, the page in outline while it's asked.
  if (status.isPending || status.isError) {
    return (
      <View style={[styles.gate, { backgroundColor: colors.background, paddingTop: insets.top + SPACE.xl }]}>
        <Waiting ready={false} failed={status.isError} onRetry={() => void status.refetch()} outline={<OutlinePage />} />
      </View>
    );
  }
  if (!status.data.owner) return <NotFound />;
  if (!status.data.mfa) return <CodeGate onPassed={() => void status.refetch()} />;
  const page = ADMIN_PAGES.find((p) => pathname.startsWith(p.path))?.key ?? 'overview';
  return (
    <ToastProvider bottom={wide ? SPACE.xl : ADMIN_TAB_BAR + insets.bottom + SPACE.lg}>
      <OwnerAskProvider>
        <AdminShell page={page} aside={<OwnerAskDock />}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        </AdminShell>
        <OwnerAskSheet />
      </OwnerAskProvider>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, paddingHorizontal: GUTTER, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' },
});

import { useQuery } from '@tanstack/react-query';
import { Stack, usePathname } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ownerStatus } from '@/api/owner';
import { ADMIN_TAB_BAR, AdminShell } from '@/components/admin/admin-shell';
import { CodeGate } from '@/components/admin/code-gate';
import { ReadFailed, Reading } from '@/components/read-state';
import { ToastProvider } from '@/components/toast';
import { SPACE, useTheme, WIDE } from '@/theme';

import NotFound from '../+not-found';

/**
 * The owner's pages (docs/specs/owner-admin.md). Anyone who isn't the owner
 * sees the app's Nothing here, as for any page that isn't there; the owner
 * passes their code first. The database checks both again on every read and
 * write, so this is the page being polite, not the lock.
 */
export default function AdminLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE;
  const pathname = usePathname();
  const status = useQuery({ queryKey: ['owner-status'], queryFn: ownerStatus, staleTime: 60_000 });
  if (status.isPending) return <Reading />;
  if (status.isError) return <ReadFailed onRetry={() => void status.refetch()} />;
  if (!status.data.owner) return <NotFound />;
  if (!status.data.mfa) return <CodeGate onPassed={() => void status.refetch()} />;
  const page = pathname.startsWith('/admin/audit') ? 'audit' : pathname.startsWith('/admin/deletions') ? 'deletions' : pathname.startsWith('/admin/inbox') ? 'inbox' : pathname.startsWith('/admin/messages') ? 'messages' : 'notices';
  return (
    <ToastProvider bottom={wide ? SPACE.xl : ADMIN_TAB_BAR + insets.bottom + SPACE.lg}>
      <AdminShell page={page}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </AdminShell>
    </ToastProvider>
  );
}

import { afterSignIn, APPROVE_PATH, DELETE_PATH, ERROR_COPY, SIGN_IN, signedOutTo } from '@app/core';
import { useFonts } from 'expo-font';
import { Stack, useGlobalSearchParams, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { RefreshCwIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { notePage } from '@/api/report-details';
import { BeingDeleted } from '@/components/account/being-deleted';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { CrashReport } from '@/components/report/crash-report';
import { NoticeBand } from '@/components/notice-banner';
import { StagingRibbon } from '@/components/staging-ribbon';
import { Body, Heading } from '@/components/text';
import { LookProvider } from '@/hooks/look';
import { QueryProvider } from '@/hooks/query';
import { MembershipProvider, useMembership } from '@/hooks/use-membership';
import { FONT_FILES, SPACE, useTheme } from '@/theme';

// Keep the splash up until Overpass has loaded and the saved session (and its
// house) has been read, so no screen shows the system font first, or the
// wrong screen to someone already signed in.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryProvider>
      <LookProvider>
        <MembershipProvider>
          <Routes />
        </MembershipProvider>
      </LookProvider>
    </QueryProvider>
  );
}

function Routes() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const { session, signedOut, house, deletion, loading, failed, refresh } = useMembership();
  const { scheme, colors } = useTheme();
  const pathname = usePathname();
  const { next } = useGlobalSearchParams<{ next?: string | string[] }>();
  // A font that fails to load falls back to the system font rather than a stuck splash.
  const ready = (fontsLoaded || fontError !== null) && !loading;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // The pages a report says they were on, if they send one.
  useEffect(() => {
    notePage(pathname);
  }, [pathname]);

  if (!ready) return null;
  if (failed) return <Unreachable onRetry={refresh} />;

  const signedIn = session !== null;
  const housed = house !== null;
  // Where each guard sends you when its screens aren't yours: signed out to
  // sign-in, as on the web, still carrying a link to starting a house or the
  // invite opened cold (but not the screen you signed out on); signed in to
  // your house, or to starting one. On
  // every platform, signing in with no house goes where sign-in's ?next was
  // carrying you (naming the house, or a join link), if it's one of those.
  const carried = pathname === SIGN_IN && typeof next === 'string' ? afterSignIn(next) : undefined;
  const home = !signedIn
    ? signedOut
      ? SIGN_IN
      : signedOutTo(pathname)
    : carried === DELETE_PATH || (carried !== undefined && APPROVE_PATH.test(carried))
      ? carried
      : housed
        ? '/today'
        : (carried ?? '/welcome');
  // An account waiting to be deleted sees only that, and Keep my account.
  if (signedIn && deletion) {
    return (
      <>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <BeingDeleted deletion={deletion} />
      </>
    );
  }
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NoticeBand>
        <StagingRibbon />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          {/* Signed out: the front door and sign-in. */}
          <Stack.Protected guard={!signedIn} redirectTo={home}>
            <Stack.Screen name="index" />
            <Stack.Screen name="signin" />
          </Stack.Protected>
          {/* Signed in, in no house: start one, or join by code. */}
          <Stack.Protected guard={signedIn && !housed} redirectTo={home}>
            <Stack.Screen name="welcome" />
            <Stack.Screen name="house/new" />
          </Stack.Protected>
          {/* In a house: its screens, as tabs. */}
          <Stack.Protected guard={signedIn && housed} redirectTo={home}>
            <Stack.Screen name="(house)" />
          </Stack.Protected>
          {/* The owner's pages, for whoever is signed in: they check the rest themselves. */}
          <Stack.Protected guard={signedIn} redirectTo={home}>
            <Stack.Screen name="admin" />
          </Stack.Protected>
          {/* The old /wall, /stake and /table links are the router's redirects
              (app.json), on to their places under House, whose guard then
              applies. A link followed inside the app goes straight there, into
              the house already open, never stacking a second one. */}
          {/* A join link opens for anyone, and signs you in in place. */}
          <Stack.Screen name="join/[joinCode]" />
          {/* So does an offer's link, signing you in in place too. */}
          <Stack.Screen name="offer/[offerCode]" />
          {/* And a connected app's request, to approve or decline. */}
          <Stack.Screen name="approve/[approvalId]" />
          {/* So do the Privacy Policy, the Terms, Help, deleting an account, and a link to nowhere. */}
          <Stack.Screen name="privacy" />
          <Stack.Screen name="help" />
          <Stack.Screen name="delete" />
          <Stack.Screen name="terms" />
          {/* The style page, where it's shown at all (components/style-page/enabled.ts). */}
          <Stack.Screen name="style" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </NoticeBand>
    </>
  );
}

/**
 * Anything that throws while drawing a screen, as the web's error page: say
 * so, try the screen again, or tell us what happened.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.unreachable, { backgroundColor: colors.background }]}>
      <Heading level={2}>{ERROR_COPY.title}</Heading>
      <Body muted>{ERROR_COPY.body}</Body>
      <ButtonRow atEdge>
        <Button label={ERROR_COPY.retry} icon={RefreshCwIcon} onPress={() => void retry()} />
      </ButtonRow>
      <CrashReport error={error} />
    </View>
  );
}

/** The house couldn't be read, so no screen can be chosen yet. */
function Unreachable({ onRetry }: { onRetry: () => Promise<void> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.unreachable, { backgroundColor: colors.background }]}>
      <Heading level={2}>{ERROR_COPY.unreachable}</Heading>
      <Body muted>{ERROR_COPY.unreachableBody}</Body>
      <ButtonRow atEdge>
        <Button label={ERROR_COPY.retry} icon={RefreshCwIcon} onPress={() => void onRetry()} />
      </ButtonRow>
    </View>
  );
}

const styles = StyleSheet.create({
  unreachable: { flex: 1, justifyContent: 'center', padding: SPACE.xl, gap: SPACE.lg },
});

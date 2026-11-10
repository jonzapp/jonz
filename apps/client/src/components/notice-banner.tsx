import { BIN_NIGHT, safeNoticeLink, type Notice } from '@app/core';
import { router } from 'expo-router';
import { GiftIcon, NewspaperIcon, TriangleAlertIcon, WifiOffIcon, XIcon, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HazardTape } from '@/components/hazard-tape';
import { IconButton } from '@/components/icon-button';
import { useNotices } from '@/hooks/use-notices';
import { CONTENT_MAX, GROUP_RADIUS, GUTTER, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

// The band at the top of every screen that carries a notice from the owner
// (an outage, an offer, news) or says Jonz can't be reached. One at a time;
// packages/core/src/notices.ts decides which. It takes the top safe area
// itself, so the screens under it (and the staging ribbon) don't pad for it
// twice.

type Tone = 'status' | 'offer' | 'news';

/**
 * Shows the band above `children` when there is something to say. The tree
 * keeps one shape whether or not the band shows, so a band coming or going
 * doesn't rebuild the screen under it (and close a half-typed sheet).
 */
export function NoticeBand({ children }: { children: ReactNode }) {
  const words = useWords();
  const { notice, unreachable, close, retry } = useNotices();
  const insets = useSafeAreaInsets();
  const showing = unreachable || notice !== null;
  return (
    <>
      {!showing ? null : unreachable ? (
        <NoticeView
          tone="status"
          icon={WifiOffIcon}
          title={words('common.notice.unreachableTitle')}
          body={words('common.notice.unreachableBody')}
          action={{ label: words('common.notice.tryNow'), onPress: retry }}
          topInset={insets.top}
          testID="notice-unreachable"
        />
      ) : (
        <NoticeView
          tone={notice!.kind}
          icon={ICON[notice!.kind]}
          title={notice!.title}
          body={notice!.body}
          action={linkAction(notice!)}
          onClose={() => close(notice!.id)}
          topInset={insets.top}
          testID={`notice-${notice!.kind}`}
        />
      )}
      <SafeAreaInsetsContext.Provider value={showing ? { ...insets, top: 0 } : insets}>{children}</SafeAreaInsetsContext.Provider>
    </>
  );
}

const ICON: Record<Tone, LucideIcon> = {
  status: TriangleAlertIcon,
  offer: GiftIcon,
  news: NewspaperIcon,
};

function linkAction(notice: Notice): { label: string; onPress: () => void } | undefined {
  const url = safeNoticeLink(notice.linkUrl);
  if (!url || !notice.linkLabel) return undefined;
  return {
    label: notice.linkLabel,
    onPress: () => (url.startsWith('/') ? router.push(url as never) : void Linking.openURL(url)),
  };
}

/** A notice as people see it, without its close button: the owner's preview. */
export function NoticePreview({ notice }: { notice: Notice }) {
  return (
    <View style={styles.preview}>
      <NoticeView
        tone={notice.kind}
        icon={ICON[notice.kind]}
        title={notice.title}
        body={notice.body}
        action={linkAction(notice)}
        testID="notice-preview"
      />
    </View>
  );
}

/** One band, drawn: kept apart from the data so it can be shown and tested on its own. */
export function NoticeView({
  tone,
  icon: Icon,
  title,
  body,
  action,
  onClose,
  topInset = 0,
  testID,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  onClose?: () => void;
  topInset?: number;
  testID?: string;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  // A status is always the night colours, so an outage looks the same by day
  // and by night; an offer is the amber plate; news sits on the card colour.
  const night = BIN_NIGHT.dark;
  const look =
    tone === 'status'
      ? { background: night.card, ink: night.foreground, icon: night.hazard }
      : tone === 'offer'
        ? {
            background: colors.hivis,
            ink: colors.onHivis,
            icon: colors.onHivis,
          }
        : {
            background: colors.card,
            ink: colors.foreground,
            icon: colors.foreground,
          };
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[
        styles.band,
        { backgroundColor: look.background, paddingTop: topInset },
        tone === 'news' && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
      ]}
    >
      {tone === 'status' ? <HazardTape height={6} tone="hazard" /> : null}
      <View style={styles.inner}>
        <Icon size={20} color={look.icon} strokeWidth={2.5} style={styles.icon} />
        <Text style={[type.body, styles.words, { color: look.ink }]}>
          <Text style={{ fontFamily: type.rowTitle.fontFamily }}>{title}</Text>
          {body ? ` ${body}` : ''}
          {action ? ' ' : ''}
          {action ? (
            <Text
              accessibilityRole="link"
              onPress={action.onPress}
              style={[styles.link, { color: tone === 'status' ? night.primary : look.ink }]}
            >
              {action.label}
            </Text>
          ) : null}
        </Text>
        {onClose ? (
          <IconButton icon={XIcon} label={words('common.notice.close')} onPress={onClose} ink={look.ink} testID="notice-close" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { width: '100%' },
  preview: { borderRadius: GROUP_RADIUS, overflow: 'hidden' },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    width: '100%',
    maxWidth: CONTENT_MAX + 2 * GUTTER,
    alignSelf: 'center',
    paddingLeft: GUTTER,
    paddingRight: SPACE.xs,
    paddingVertical: SPACE.sm,
  },
  icon: { marginTop: SPACE.md },
  words: { flex: 1, minWidth: 0, paddingVertical: SPACE.sm },
  link: { textDecorationLine: 'underline' },
});

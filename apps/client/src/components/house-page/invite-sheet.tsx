import { HOUSE_PAGE_COPY, INVITE_COPY, BUSY_COPY } from '@app/core';
import { CheckIcon, CopyIcon, RefreshCwIcon, Share2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { resetJoinCode } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Sheet } from '@/components/sheet';
import { SectionLabel } from '@/components/text';
import { useMove } from '@/hooks/use-move';
import { SITE_URL } from '@/links';
import { SPACE, useTheme } from '@/theme';

/** What the web build can do with a link: the browser's clipboard and share sheet, where it has them. */
interface WebNavigator {
  clipboard?: { writeText: (text: string) => Promise<void> };
  share?: unknown;
}

function webNavigator(): WebNavigator | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { navigator?: WebNavigator }).navigator;
}

/**
 * Inviting housemates, a brand moment, so it's signed like the join page
 * the link opens: the front door's tape across the top, the join code in
 * its big caps, spaced wide to read out across a room, the link under it, then the sheet's one amber
 * "Share invite" (the system share sheet, as the old invite card) and, on
 * the web, "Copy link". A phone has no clipboard module, and its share
 * sheet has a Copy of its own, so there it's Share invite alone; a browser
 * with no share sheet copies the link from Share invite instead. An admin
 * (`resetFor`, the house's id) also gets "New code", quiet under the rest,
 * for a link that's gone somewhere it shouldn't: the house is read again, so
 * the new code shows here at once.
 */
export function InviteSheet({
  visible,
  onClose,
  code,
  houseName,
  resetFor,
}: {
  visible: boolean;
  onClose: () => void;
  code: string;
  houseName: string;
  /** The house's id, for an admin, who can ask for a new code. */
  resetFor?: string;
}) {
  const { colors, type } = useTheme();
  const [copied, setCopied] = useState(false);
  const reset = useMove(resetFor ?? '');
  const url = `${SITE_URL}/join/${code}`;
  const web = webNavigator();

  async function share() {
    if (web && typeof web.share !== 'function') return copy();
    try {
      await Share.share({ title: INVITE_COPY.shareTitle(houseName), message: url, url });
    } catch {
      // Cancelled: the link is on screen to copy.
    }
  }

  async function copy() {
    const clipboard = web?.clipboard;
    if (!clipboard) return;
    try {
      await clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Not allowed (an insecure page, say): the link is on screen to select.
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title={HOUSE_PAGE_COPY.invite}
      description={HOUSE_PAGE_COPY.inviteBody}
      tape
      testID="invite-sheet"
    >
      <View style={styles.sign}>
        <SectionLabel>{HOUSE_PAGE_COPY.code}</SectionLabel>
        <Text selectable style={[type.heading(1), styles.code]} testID="invite-code">
          {code}
        </Text>
        <Text selectable numberOfLines={1} style={[type.meta, { color: colors.mutedForeground }]} testID="invite-url">
          {url}
        </Text>
      </View>
      <View style={styles.buttons}>
        <ButtonRow stacked>
          <Button icon={Share2Icon} label={HOUSE_PAGE_COPY.shareInvite} onPress={() => void share()} testID="share-invite" />
          {web?.clipboard ? (
            <Button
              variant="outline"
              icon={copied ? CheckIcon : CopyIcon}
              label={copied ? INVITE_COPY.copied : HOUSE_PAGE_COPY.copyLink}
              onPress={() => void copy()}
              testID="copy-link"
            />
          ) : null}
        </ButtonRow>
      </View>
      {resetFor ? (
        <View style={styles.reset}>
          <ButtonRow>
            <Button
              variant="ghost"
              icon={RefreshCwIcon}
              label={INVITE_COPY.newCode}
              busy={reset.pending}
              busyLabel={BUSY_COPY.resetting}
              onPress={() => {
                setCopied(false);
                void reset.run(() => resetJoinCode(resetFor));
              }}
              testID="new-code"
            />
          </ButtonRow>
          <Text style={[type.meta, { color: colors.mutedForeground }]}>{INVITE_COPY.newCodeNote}</Text>
          {reset.problem ? <Alert message={reset.problem} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sign: { gap: SPACE.xs, marginTop: SPACE.sm },
  // The code to read out across a room: the brand pages' big caps, spaced wide.
  code: { letterSpacing: 6 },
  buttons: { gap: SPACE.sm, marginTop: SPACE.md },
  reset: { gap: SPACE.xs, marginTop: SPACE.md },
});

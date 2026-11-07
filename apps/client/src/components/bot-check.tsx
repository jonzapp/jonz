import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { TURNSTILE_HOME, turnstileKey, turnstilePage } from '@/api/turnstile';
import { useTheme } from '@/theme';

/** Turnstile's widget, at its own size, while it wants a tap. */
const SHOWN = 70;

/**
 * Cloudflare's bot check for the email form. On a phone it runs in a small
 * web view that says it's jonz.app; it takes no room unless Cloudflare needs
 * a tap. `onToken` gets each token (null when it lapses); a token works once,
 * so the form bumps `round` after each try and the check starts again.
 */
/** The library types its props as `WebViewProps & P`, with P undefined by default, which is never. */
type Page = WebView<Record<never, never>>;

export function BotCheck({ onToken, round }: { onToken: (token: string | null) => void; round: number }) {
  const { scheme } = useTheme();
  const view = useRef<Page>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (round > 0) view.current?.injectJavaScript('window.resetCheck();true;');
  }, [round]);

  function onMessage(event: WebViewMessageEvent) {
    const message = JSON.parse(event.nativeEvent.data) as { token?: string | null; show?: boolean };
    if ('token' in message) onToken(message.token ?? null);
    if ('show' in message) setShown(Boolean(message.show));
  }

  return (
    <View style={[styles.box, { height: shown ? SHOWN : 0 }]} testID="bot-check">
      <WebView<Record<never, never>>
        ref={view}
        source={{ html: turnstilePage(turnstileKey(null), scheme), baseUrl: TURNSTILE_HOME }}
        originWhitelist={['*']}
        onMessage={onMessage}
        scrollEnabled={false}
        style={styles.view}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  view: { backgroundColor: 'transparent' },
});

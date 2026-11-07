import { createElement, useEffect, useRef, useState } from 'react';

import { TURNSTILE_SCRIPT, turnstileKey } from '@/api/turnstile';
import { useTheme } from '@/theme';

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/** Cloudflare's script, loaded once for the page. */
let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare's bot check for the email form, on the web: the real widget on
 * jonz.app, Cloudflare's always-pass test key anywhere else. It takes no room
 * unless Cloudflare needs a tap. `onToken` gets each token (null when it
 * lapses); a token works once, so the form bumps `round` after each try and
 * the check starts again.
 */
export function BotCheck({ onToken, round }: { onToken: (token: string | null) => void; round: number }) {
  const { scheme } = useTheme();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const widget = useRef<{ api: Turnstile; id: string } | null>(null);
  const tell = useRef(onToken);
  useEffect(() => {
    tell.current = onToken;
  });

  useEffect(() => {
    if (round === 0 || !widget.current) return;
    tell.current(null);
    widget.current.api.reset(widget.current.id);
  }, [round]);

  useEffect(() => {
    let gone = false;
    loadTurnstile()
      .then((api) => {
        if (gone || !box) return;
        const id = api.render(box, {
          sitekey: turnstileKey(window.location.hostname),
          theme: scheme,
          appearance: 'interaction-only',
          callback: (token: string) => tell.current(token),
          'expired-callback': () => tell.current(null),
          'error-callback': () => tell.current(null),
        });
        widget.current = { api, id };
      })
      .catch(() => tell.current(null));
    return () => {
      gone = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [box, scheme]);

  return createElement('div', { ref: setBox, 'data-testid': 'bot-check' });
}

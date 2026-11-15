import { useEffect } from 'react';
import { Platform } from 'react-native';

import { focusRing, useTheme } from '@/theme';

/**
 * How a pressable wears the keyboard's focus ring on the web, as its
 * `dataSet`: `edge` turns its own edge to the ring (a button); a row's press
 * target is `row`, and the row round it (`ringRow`) draws the ring inside its
 * own edges, where its group can't clip it.
 */
export const RING_EDGE = { ring: 'edge' } as const;
export const RING_ROW = { ring: 'row' } as const;
export const RING_ROW_HOLDER = { ringRow: '' } as const;

/** The style sheet's rules for the ring in these colours. */
export function focusRingRules(ring: { borderColor: string; boxShadow: string }): string {
  const inside = ring.boxShadow.replace(/^0 0 0 (\d+)px/, (_, halo: string) => `inset 0 0 0 ${Number(halo) + 1}px`);
  return [
    '[data-ring]:focus-visible { outline: none; }',
    `[data-ring="edge"]:focus-visible { border-color: ${ring.borderColor} !important; box-shadow: ${ring.boxShadow} !important; }`,
    `[data-ring-row]:has([data-ring="row"]:focus-visible) { box-shadow: inset 0 0 0 1px ${ring.borderColor}, ${inside}; }`,
  ].join('\n');
}

/**
 * The one focus ring on buttons and rows, on the web: only when the keyboard
 * brought you there (the browser's `:focus-visible`), never after a tap or a
 * click, in place of the browser's own outline. It's a style sheet because
 * only the browser knows how focus arrived. Mounted once, in the root
 * layout; it follows the look. Text boxes wear the same ring themselves,
 * while you type in them (`focusRing` in the theme).
 */
export function FocusRings() {
  const { colors } = useTheme();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let sheet = document.getElementById('jonz-focus');
    if (sheet == null) {
      sheet = document.createElement('style');
      sheet.id = 'jonz-focus';
      document.head.appendChild(sheet);
    }
    sheet.textContent = focusRingRules(focusRing(colors));
  }, [colors]);
  return null;
}

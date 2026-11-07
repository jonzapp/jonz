import { withAlpha } from '@app/core';
import { Link, type Href } from 'expo-router';
import { useState, type ComponentType } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { useRowFit } from '@/components/button-row';
import { ICON, ICON_ONLY, RADIUS, SPACE, TAP, useTheme } from '@/theme';

type Variant = 'primary' | 'outline' | 'ghost' | 'hazard';

/** A lucide icon, or anything drawn the same way (Google's mark). */
export type ButtonIcon = ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

/**
 * A button at least a thumb tall, its label in RowTitle. `primary` wears
 * hi-vis amber: the one thing to do on a screen, at most one per screen.
 * `outline` is the secondary one, edged in muted ink. `ghost` has no edge.
 * `hazard` is for a choice that strikes something out: an outline edged in
 * hazard with a hazard icon and the words in ink, never a fill, so it reads
 * on the pavement too. `chosen` (true or false) makes it one of a pair you
 * pick from, such as the vote: the chosen one gets an ink edge on the tint,
 * never amber, and says so (`aria-pressed` on the web, `aria-selected`
 * elsewhere). With `href` it is a link dressed as a button (an anchor on
 * the web). `iconOnly` shows just the icon, square, and `label` still names
 * it for screen readers. `iconAfter` puts the icon after the words, for a
 * way on (a chevron pointing forward). `spoken` is what a screen reader hears instead of
 * the label, when the label leans on the row beside it. `expanded` says a
 * panel or menu it opens is open (`aria-expanded`). `ink` recolours a ghost
 * button's icon and words for a coloured band (a notice), from the theme.
 * Inside a `ButtonRow` it takes an equal share of the line, or the full
 * width when the row stacks or it is on its own; its words wrap rather
 * than get cut. Screens never restyle a button: a `ButtonRow` places every
 * one, alone or together (the lint rule `jonz/button-in-row`).
 */
export function Button({
  label,
  onPress,
  href,
  variant = 'primary',
  icon: Icon,
  disabled = false,
  iconOnly = false,
  iconAfter = false,
  chosen,
  spoken,
  expanded,
  ink,
  testID,
}: {
  label: string;
  onPress?: () => void;
  href?: Href;
  variant?: Variant;
  icon?: ButtonIcon;
  disabled?: boolean;
  iconOnly?: boolean;
  /** The icon after the label rather than before it. */
  iconAfter?: boolean;
  /** One of a pair to pick from: whether this is the one picked. */
  chosen?: boolean;
  spoken?: string;
  /** For a button that opens a panel or menu: whether it's open. */
  expanded?: boolean;
  /** A ghost button's icon and words on a coloured band: a colour from the theme. */
  ink?: string;
  testID?: string;
}) {
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState(false);
  const row = useRowFit();
  const fit = row?.fit ?? null;
  const base = chosen
    ? { background: colors.secondary, ink: colors.foreground, edge: colors.foreground, icon: colors.foreground }
    : {
        primary: { background: colors.hivis, ink: colors.onHivis, edge: colors.hivis, icon: colors.onHivis },
        outline: { background: 'transparent', ink: colors.foreground, edge: colors.mutedForeground, icon: colors.foreground },
        ghost: { background: 'transparent', ink: colors.foreground, edge: 'transparent', icon: colors.foreground },
        hazard: { background: 'transparent', ink: colors.foreground, edge: colors.hazard, icon: colors.hazard },
      }[variant];
  const look = ink ? { ...base, ink, icon: ink } : base;
  // A toggle's state: the web hears aria-pressed, which React Native lacks.
  const chosenState =
    chosen === undefined ? {} : Platform.OS === 'web' ? ({ 'aria-pressed': chosen } as object) : { 'aria-selected': chosen };
  const expandedState = expanded === undefined ? {} : ({ 'aria-expanded': expanded } as object);
  // For the layout checks (e2e/button-rules.ts): how the button was placed and its kind, as data-* on the web.
  const placed =
    Platform.OS === 'web' ? ({ dataSet: { button: iconOnly ? 'icon' : (fit ?? 'loose'), variant: chosen === undefined ? variant : 'chosen' } } as object) : {};

  const button = (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      aria-disabled={disabled}
      {...chosenState}
      {...expandedState}
      {...placed}
      accessibilityLabel={iconOnly ? label : spoken}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID={testID}
      // One flat object, not a function or an array: Link's asChild merges
      // styles by spreading them, which would drop either.
      style={StyleSheet.flatten([
        styles.button,
        iconOnly && styles.square,
        fit === 'share' && styles.share,
        fit === 'full' && styles.full,
        {
          backgroundColor: pressed && look.background === 'transparent' ? withAlpha(colors.foreground, 0.06) : look.background,
          borderColor: look.edge,
          opacity: disabled ? 0.5 : pressed && look.background !== 'transparent' ? 0.85 : 1,
        },
      ])}
    >
      {Icon && !iconAfter ? <Icon size={iconOnly ? ICON_ONLY : ICON} color={look.icon} aria-hidden /> : null}
      {iconOnly ? null : (
        <Text
          style={[type.rowTitle, styles.words, { color: look.ink }]}
          // Sharing a row, words on a second line mean the row should stack.
          onLayout={
            fit === 'share'
              ? (event) => {
                  if (event.nativeEvent.layout.height > (type.rowTitle.lineHeight ?? TAP) * 1.5) row?.wrapped();
                }
              : undefined
          }
        >
          {label}
        </Text>
      )}
      {Icon && iconAfter ? <Icon size={ICON} color={look.icon} aria-hidden /> : null}
    </Pressable>
  );
  return href ? (
    <Link href={href} asChild>
      {button}
    </Link>
  ) : (
    button
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  square: { minWidth: TAP, paddingHorizontal: SPACE.md },
  // In a ButtonRow: an equal share of the line, as tall as the tallest.
  share: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignSelf: 'stretch' },
  // In a stacked ButtonRow: the row's whole width.
  full: { alignSelf: 'stretch' },
  // Words that don't fit wrap inside the button, centred, never cut.
  words: { flexShrink: 1, textAlign: 'center' },
});

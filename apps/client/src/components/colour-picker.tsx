import {
  BIN_NIGHT,
  colourCode,
  hexToHsv,
  hsvToHex,
  KIND_COLOURS,
  KIND_COLOUR_NAMES,
  lidColour,
  lightColour,
  type Hsv,
} from '@app/core';
import { CheckIcon, PlusIcon } from 'lucide-react-native';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Field } from '@/components/field';
import { useWords } from '@/hooks/use-words';
import { GROUP_RADIUS, SPACE, TAP, useTheme } from '@/theme';

// The colour model's own ends, not the theme's: the shade square fades from
// white across and to black down, whatever the scheme.
const WHITE = '#ffffff';
const BLACK = '#000000';
/** The thumbs' ring and a tick on a dark colour; ink for a tick on a light one. */
const RING = BIN_NIGHT.light.card;
const INK = BIN_NIGHT.light.foreground;
/** Hues round the track and the rainbow dot, a stop every 60°. */
const HUE_STOPS = [0, 60, 120, 180, 240, 300, 360];
const hueColour = (h: number) => hsvToHex({ h: h % 360, s: 1, v: 1 });

const PER_ROW = 6;
const DOT_GAP = SPACE.xs;
const SHADE_HEIGHT = 168;
const TRACK = 14;

/**
 * A kind's colour (Colour picker, 14 Nov: colours, then any colour): the
 * eleven ready colours as round dots, six to a row, then the rainbow dot,
 * which opens any colour under them: a shade square, a hue track and the
 * colour's code. The chosen dot wears a ring and a tick. Each colour shows
 * as its lid will in this scheme (after dark, its night shade); the colour
 * kept is its day one. `children` (How it looks) goes under it.
 */
export function ColourPicker({ value, onChange, children }: { value: string; onChange: (colour: string) => void; children?: ReactNode }) {
  const words = useWords();
  const ready = (KIND_COLOURS as readonly string[]).includes(value.toLowerCase());
  const [custom, setCustom] = useState(!ready);
  const [width, setWidth] = useState(0);
  // The dots share the row: as big as a row of six allows, up to a tap target (that, until it's measured).
  const dot = width === 0 ? TAP : Math.max(32, Math.min(TAP, Math.floor((width - DOT_GAP * (PER_ROW - 1)) / PER_ROW)));
  const rows = [KIND_COLOURS.slice(0, PER_ROW), KIND_COLOURS.slice(PER_ROW)];
  return (
    <View style={styles.picker} testID="colour-picker">
      <View
        style={styles.dots}
        accessibilityRole="radiogroup"
        accessibilityLabel={words('house.kinds.colour')}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {rows.map((row, r) => (
              <View key={r} style={styles.dotRow}>
                {row.map((c) => (
                  <Dot
                    key={c}
                    colour={c}
                    size={dot}
                    on={!custom && c === value.toLowerCase()}
                    label={words(`house.kinds.colourName.${KIND_COLOUR_NAMES[c]}` as const)}
                    onPress={() => {
                      setCustom(false);
                      onChange(c);
                    }}
                  />
                ))}
                {r === 1 ? <RainbowDot size={dot} on={custom} onPress={() => setCustom(true)} /> : null}
              </View>
            ))}
      </View>
      {custom ? <AnyColour value={value} onChange={onChange} /> : null}
      {children}
    </View>
  );
}

/** One ready colour: a round dot, with a ring and a tick when it's the one. */
function Dot({ colour, size, on, label, onPress }: { colour: string; size: number; on: boolean; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const shown = lidColour(colors, colour);
  const inner = size - SPACE.sm;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={(TAP - size) / 2 > 0 ? (TAP - size) / 2 : 0}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: on ? colors.foreground : 'transparent' }]}
      testID="colour-dot"
    >
      <View style={[styles.centred, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: shown }]}>
        {on ? <CheckIcon size={inner / 2} color={lightColour(shown) ? INK : RING} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

/** The rainbow dot with a plus: any colour, opened under the dots. */
function RainbowDot({ size, on, onPress }: { size: number; on: boolean; onPress: () => void }) {
  const words = useWords();
  const { colors } = useTheme();
  const inner = size - SPACE.sm;
  const r = inner / 2;
  const n = 36;
  const at = (a: number) => `${r + r * Math.cos(a)},${r + r * Math.sin(a)}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={words('house.kinds.anyColour')}
      hitSlop={(TAP - size) / 2 > 0 ? (TAP - size) / 2 : 0}
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: on ? colors.foreground : 'transparent' }]}
      testID="custom-colour"
    >
      <View style={{ width: inner, height: inner }}>
        <Svg width={inner} height={inner} aria-hidden>
          {Array.from({ length: n }, (_, i) => {
            const a0 = ((i - 0.6) / n) * 2 * Math.PI - Math.PI / 2;
            const a1 = ((i + 0.6) / n) * 2 * Math.PI - Math.PI / 2;
            return <Path key={i} d={`M${r},${r} L${at(a0)} A${r},${r} 0 0 1 ${at(a1)} Z`} fill={hsvToHex({ h: (i / n) * 360, s: 0.75, v: 0.92 })} />;
          })}
          <Circle cx={r} cy={r} r={r * 0.48} fill={colors.card} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centred]} pointerEvents="none">
          <PlusIcon size={inner / 2.6} color={colors.foreground} strokeWidth={3} />
        </View>
      </View>
    </Pressable>
  );
}

/** Any colour: the shade square for the hue, the hue track, and the colour's code to read or type. */
function AnyColour({ value, onChange }: { value: string; onChange: (colour: string) => void }) {
  const words = useWords();
  // Kept here, so taking the shade to grey or black doesn't lose the hue.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [typed, setTyped] = useState(value);
  const pick = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setTyped(hex);
    onChange(hex);
  };
  const type = (text: string) => {
    setTyped(text);
    const hex = colourCode(text);
    if (hex) {
      setHsv(hexToHsv(hex));
      onChange(hex);
    }
  };
  const problem = colourCode(typed) === null ? words('errors.bad_colour') : undefined;
  return (
    <View style={styles.any} testID="any-colour">
      <ShadeSquare hsv={hsv} onPick={pick} />
      <HueTrack hsv={hsv} onPick={pick} />
      <Field
        label={words('house.kinds.code')}
        value={typed}
        onChangeText={type}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        hint={words('house.kinds.codeHint')}
        problem={problem}
        testID="colour-code"
      />
    </View>
  );
}

/**
 * Pressing and dragging over a box, as fractions of its width and height
 * (0 to 1, held in): where it started, then as it moves, even past its edge.
 */
function useDrag(onAt: (x: number, y: number) => void) {
  const size = useRef({ w: 1, h: 1 });
  const origin = useRef({ x: 0, y: 0 });
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const at = (e: GestureResponderEvent) => onAt(clamp((e.nativeEvent.pageX - origin.current.x) / size.current.w), clamp((e.nativeEvent.pageY - origin.current.y) / size.current.h));
  return {
    onLayout: (e: LayoutChangeEvent) => {
      size.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) };
    },
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      // Where the box starts on the page: the press, less how far into the box it is.
      origin.current = { x: e.nativeEvent.pageX - e.nativeEvent.locationX, y: e.nativeEvent.pageY - e.nativeEvent.locationY };
      at(e);
    },
    onResponderMove: at,
  };
}

/** An id for an SVG gradient, unique on the page (useId's own has colons, which url(#…) can't take). */
const useSvgId = (name: string) => `${name}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** How strong (across) and how light (down) the hue is, with a thumb on the pick. */
function ShadeSquare({ hsv, onPick }: { hsv: Hsv; onPick: (hsv: Hsv) => void }) {
  const words = useWords();
  const across = useSvgId('across');
  const down = useSvgId('down');
  const drag = useDrag((x, y) => onPick({ h: hsv.h, s: x, v: 1 - y }));
  const step = (ds: number, dv: number) => onPick({ h: hsv.h, s: Math.min(1, Math.max(0, hsv.s + ds)), v: Math.min(1, Math.max(0, hsv.v + dv)) });
  return (
    <View
      {...drag}
      style={styles.shade}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={words('house.kinds.shade')}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(0, e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)}
      testID="colour-shade"
    >
      <Svg width="100%" height={SHADE_HEIGHT} pointerEvents="none" aria-hidden>
        <Defs>
          <LinearGradient id={across} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={WHITE} stopOpacity="1" />
            <Stop offset="1" stopColor={WHITE} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={down} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={BLACK} stopOpacity="0" />
            <Stop offset="1" stopColor={BLACK} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={SHADE_HEIGHT} fill={hueColour(hsv.h)} />
        <Rect width="100%" height={SHADE_HEIGHT} fill={`url(#${across})`} />
        <Rect width="100%" height={SHADE_HEIGHT} fill={`url(#${down})`} />
      </Svg>
      <Thumb left={`${hsv.s * 100}%`} top={(1 - hsv.v) * SHADE_HEIGHT} fill={hsvToHex(hsv)} size={22} />
    </View>
  );
}

/** The hue track: a rainbow pill, a thumb on the hue. */
function HueTrack({ hsv, onPick }: { hsv: Hsv; onPick: (hsv: Hsv) => void }) {
  const words = useWords();
  const id = useSvgId('hue');
  const drag = useDrag((x) => onPick({ ...hsv, h: Math.min(359.9, x * 360) }));
  return (
    <View
      {...drag}
      style={styles.hue}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={words('house.kinds.hue')}
      accessibilityValue={{ min: 0, max: 360, now: Math.round(hsv.h) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onPick({ ...hsv, h: (hsv.h + (e.nativeEvent.actionName === 'increment' ? 10 : 350)) % 360 })}
      testID="colour-hue"
    >
      <View style={styles.track} pointerEvents="none">
        <Svg width="100%" height={TRACK} aria-hidden>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              {HUE_STOPS.map((h, i) => (
                <Stop key={h} offset={String(i / (HUE_STOPS.length - 1))} stopColor={hueColour(h)} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={TRACK} fill={`url(#${id})`} />
        </Svg>
      </View>
      <Thumb left={`${(hsv.h / 360) * 100}%`} top={TAP / 2} fill={hueColour(hsv.h)} size={24} />
    </View>
  );
}

/** A thumb as the colour kits draw them: the colour in a white ring with a soft shadow. */
function Thumb({ left, top, size, fill }: { left: `${number}%`; top: number; size: number; fill: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.thumb,
        { left, top, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: size / 2, borderColor: RING, backgroundColor: fill },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  picker: { gap: SPACE.md, paddingVertical: SPACE.sm },
  dots: { gap: SPACE.xs },
  dotRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  centred: { alignItems: 'center', justifyContent: 'center' },
  any: { gap: SPACE.lg },
  shade: { height: SHADE_HEIGHT, borderRadius: GROUP_RADIUS, overflow: 'hidden' },
  hue: { height: TAP, justifyContent: 'center' },
  track: { height: TRACK, borderRadius: TRACK / 2, overflow: 'hidden' },
  thumb: { position: 'absolute', borderWidth: 3, boxShadow: '0 0 0 1px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.35)' },
});

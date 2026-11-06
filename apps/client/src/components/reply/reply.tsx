import { parseReply, type Block, type Inline, type ReplyCard } from '@app/core';
import { router, type Href } from 'expo-router';
import { ArrowUpRightIcon, CheckIcon } from 'lucide-react-native';
import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Avatar } from '@/components/avatar';
import { LidBar } from '@/components/lid';
import { Body, SectionLabel } from '@/components/text';
import { FONT, RADIUS, SPACE, TABULAR, useTheme } from '@/theme';

/** What a chip in a reply stands for, once the app has found it. */
export interface ChipTarget {
  /** What's drawn before the words: a John's lid, a person's plate, or a page's arrow. */
  lead: { kind: 'lid'; category: string } | { kind: 'person'; name: string; userId: string | null; me: boolean } | { kind: 'page' };
  /** Where a tap goes, or what it does (a John's sheet). */
  href?: Href;
  onPress?: () => void;
  /** Said by a screen reader: "Bins out, John", "Priya", "Days and time away, page". */
  spoken: string;
}

/**
 * How a reply finds what its chips and cards stand for: the house's Johns,
 * its people and its pages, and the live cards. Each answers null for
 * something it doesn't know (a John since deleted, someone who left), and
 * the chip is then drawn as its words in bold.
 */
export interface ReplyPieces {
  john(ref: string): ChipTarget | null;
  person(ref: string): ChipTarget | null;
  page(ref: string): ChipTarget | null;
  card(card: ReplyCard): ReactNode;
}

/** Nothing found: every chip its words, every card left out. */
export const NO_PIECES: ReplyPieces = { john: () => null, person: () => null, page: () => null, card: () => null };

const Pieces = createContext<ReplyPieces>(NO_PIECES);

/**
 * One of Jonz's replies, drawn in the app's own words and pieces: Markdown
 * (packages/core reply-format.ts) set in Body with bold runs, SectionLabel
 * headings, lists with their marks in a gutter, tables on the card colour,
 * quotes behind an edge; chips for Johns, people and pages inside a
 * sentence; and live cards between the paragraphs. Nothing in the text
 * runs, and nothing it names that the app can't find is drawn as more than
 * words.
 */
export function Reply({ source, pieces = NO_PIECES, testID }: { source: string; pieces?: ReplyPieces; testID?: string }) {
  const blocks = useMemo(() => parseReply(source), [source]);
  return (
    <Pieces.Provider value={pieces}>
      <View style={styles.reply} testID={testID}>
        <Blocks blocks={blocks} />
      </View>
    </Pieces.Provider>
  );
}

function Blocks({ blocks, tight = false }: { blocks: Block[]; tight?: boolean }) {
  return (
    <View style={tight ? styles.tight : styles.reply}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  const { colors, type } = useTheme();
  const pieces = useContext(Pieces);
  switch (block.t) {
    case 'p':
      return (
        <Body testID="reply-p" style={hasChip(block.kids) ? styles.chipLines : undefined}>
          <Runs kids={block.kids} />
        </Body>
      );
    case 'heading':
      return (
        <SectionLabel testID="reply-heading" style={styles.heading}>
          {plainOf(block.kids)}
        </SectionLabel>
      );
    case 'list':
      return (
        <View
          style={styles.list}
          accessibilityRole={Platform.OS === 'web' ? ('list' as never) : undefined}
          testID={block.ordered ? 'reply-ol' : 'reply-ul'}
        >
          {block.items.map((item, i) => {
            // The number, bullet or box sits on the item's first line, which is taller when it has a pill.
            const first = item.blocks[0];
            const tall = first?.t === 'p' && hasChip(first.kids);
            return (
            <View
              key={i}
              style={styles.item}
              accessibilityRole={Platform.OS === 'web' ? ('listitem' as never) : undefined}
              testID="reply-li"
            >
              {/* A step's number is read out (a list's order matters); a bullet or a box isn't, the item says Done or To do. */}
              <View style={[styles.mark, tall && styles.markTall]} aria-hidden={!block.ordered || item.checked !== null}>
                {item.checked !== null ? (
                  <View style={[styles.box, { borderColor: colors.foreground }, item.checked && { backgroundColor: colors.foreground }]}>
                    {item.checked ? <CheckIcon size={12} strokeWidth={3} color={colors.background} /> : null}
                  </View>
                ) : block.ordered ? (
                  <Text style={[type.body, styles.number, tall && styles.chipLines]}>{`${block.start + i}.`}</Text>
                ) : (
                  <View style={[styles.bullet, { backgroundColor: colors.foreground }]} />
                )}
              </View>
              <View
                style={styles.itemBody}
                accessibilityLabel={item.checked === null ? undefined : item.checked ? 'Done' : 'To do'}
              >
                <Blocks blocks={item.blocks} tight />
              </View>
            </View>
            );
          })}
        </View>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.border }]} testID="reply-quote">
          <Blocks blocks={block.blocks} tight />
        </View>
      );
    case 'table':
      return <Table head={block.head} rows={block.rows} align={block.align} />;
    case 'rule':
      return <View style={[styles.rule, { backgroundColor: colors.border }]} aria-hidden testID="reply-rule" />;
    case 'card': {
      const card = pieces.card(block.card);
      return card ? <View testID={`reply-card-${block.card.card}`}>{card}</View> : null;
    }
  }
}

/** A table on the card colour: the head in bold on the sunk tint, a hairline between rows, numbers at the end. */
function Table({ head, rows, align }: { head: Inline[][]; rows: Inline[][][]; align: ('left' | 'right' | 'center' | null)[] }) {
  const { colors, type } = useTheme();
  const cell = (kids: Inline[], j: number, isHead: boolean) => (
    <Text
      key={j}
      style={[
        isHead ? [type.meta, { fontFamily: FONT.bold, color: colors.foreground }] : type.body,
        styles.cell,
        j === 0 && styles.firstCell,
        { textAlign: align[j] ?? 'left' } as TextStyle,
      ]}
    >
      <Runs kids={kids} />
    </Text>
  );
  return (
    <View style={[styles.table, { backgroundColor: colors.card }]} testID="reply-table">
      <View style={[styles.tr, { backgroundColor: colors.secondary }]}>{head.map((c, j) => cell(c, j, true))}</View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.tr, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          {head.map((_, j) => cell(r[j] ?? [], j, false))}
        </View>
      ))}
    </View>
  );
}

/** Whether a paragraph has a pill in it: its lines then open up, so pills on lines above and below each other don't touch. */
function hasChip(kids: Inline[]): boolean {
  return kids.some((k) => k.t === 'chip' || ('kids' in k && hasChip(k.kids)));
}

function plainOf(kids: Inline[]): string {
  return kids.map((k) => (k.t === 'text' ? k.text : k.t === 'chip' ? k.label : k.t === 'br' ? ' ' : plainOf(k.kids))).join('');
}

/** A paragraph's runs: words, bold, italic, struck, chips, line breaks. */
function Runs({ kids }: { kids: Inline[] }) {
  return (
    <>
      {kids.map((k, i) => {
        switch (k.t) {
          case 'text':
            return <Fragment key={i}>{k.text}</Fragment>;
          case 'br':
            return <Fragment key={i}>{'\n'}</Fragment>;
          case 'strong':
            return (
              <Text key={i} style={styles.strong}>
                <Runs kids={k.kids} />
              </Text>
            );
          case 'em':
            return (
              <Text key={i} style={styles.em}>
                <Runs kids={k.kids} />
              </Text>
            );
          case 'del':
            return (
              <Text key={i} style={styles.del}>
                <Runs kids={k.kids} />
              </Text>
            );
          case 'chip':
            return <ChipRun key={i} chip={k} />;
        }
      })}
    </>
  );
}

function ChipRun({ chip }: { chip: Extract<Inline, { t: 'chip' }> }) {
  const pieces = useContext(Pieces);
  const target = chip.kind === 'john' ? pieces.john(chip.ref) : chip.kind === 'person' ? pieces.person(chip.ref) : pieces.page(chip.ref);
  if (!target) return <Text style={styles.strong}>{chip.label}</Text>;
  return <Chip label={chip.label} target={target} />;
}

/**
 * A John, person or page inside a sentence: a pill on the card colour with
 * a hairline edge, its lid, plate or arrow, and the words in bold. It sits on
 * the text's line; the tap target is the pill grown to 32 tall, which
 * WCAG's target-size rule allows for a target inside a sentence.
 */
export function Chip({ label, target }: { label: string; target: ChipTarget }) {
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState(false);
  const lead = target.lead;
  const { href, onPress } = target;
  return (
    <View style={styles.chipSlot}>
      <Pressable
        accessibilityRole={href ? 'link' : 'button'}
        accessibilityLabel={target.spoken}
        onPress={onPress ?? (href ? () => router.push(href) : undefined)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        hitSlop={{ top: 6, bottom: 6 }}
        testID={`reply-chip-${lead.kind === 'lid' ? 'john' : lead.kind}`}
        style={[
          styles.chip,
          { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border },
          lead.kind === 'person' && styles.chipPerson,
        ]}
      >
        {lead.kind === 'lid' ? <LidBar category={lead.category} /> : null}
        {lead.kind === 'person' ? <Avatar name={lead.name} userId={lead.userId} me={lead.me} size={24} /> : null}
        <Text style={[type.body, styles.chipWords, { color: colors.foreground }]} numberOfLines={1}>
          {label}
        </Text>
        {lead.kind === 'page' ? <ArrowUpRightIcon size={16} strokeWidth={2.25} color={colors.foreground} aria-hidden /> : null}
      </Pressable>
    </View>
  );
}

const CHIP_HEIGHT = 28;
/** A line with pills in it: a pill and a small gap, so two pills on lines one above the other never touch. */
const CHIP_LINE = CHIP_HEIGHT + SPACE.xs;
/** A bullet's dot and a task's box, drawn to sit on Body's line. */
const DOT = 6;
const BOX = 18;
/** How far a person's plate sits from the pill's round end: the plate and the end share a centre. */
const PLATE_INSET = (CHIP_HEIGHT - 24) / 2;

const styles = StyleSheet.create({
  reply: { gap: SPACE.md },
  tight: { gap: SPACE.sm },
  heading: { marginTop: SPACE.xs },
  strong: { fontFamily: FONT.bold },
  // Overpass has no italic of its own here, so emphasis is the bold's lighter cousin: the browser's slant on web, plain on phones.
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  list: { gap: SPACE.sm },
  item: { flexDirection: 'row', gap: SPACE.sm },
  mark: { width: 24, height: 24, alignItems: 'flex-end', justifyContent: 'center' },
  number: { ...TABULAR },
  bullet: { width: DOT, height: DOT, borderRadius: DOT / 2, marginRight: SPACE.xs },
  box: { width: BOX, height: BOX, borderRadius: BOX / 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, minWidth: 0 },
  quote: { borderLeftWidth: 3, paddingLeft: SPACE.md },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: SPACE.xs },
  table: { borderRadius: RADIUS, overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.md },
  cell: { flex: 1, minWidth: 0, ...TABULAR },
  firstCell: { flex: 1.6 },
  // The pill keeps to the line: its slot is a line tall (Body's 24) and the pill hangs over it a little.
  chipLines: { lineHeight: CHIP_LINE },
  markTall: { height: CHIP_LINE },
  chipSlot: { height: 24, justifyContent: 'center', ...(Platform.OS === 'web' ? ({ verticalAlign: 'middle' } as object) : {}) },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    borderRadius: CHIP_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    maxWidth: 260,
  },
  chipPerson: { paddingLeft: PLATE_INSET },
  chipWords: { fontFamily: FONT.bold, flexShrink: 1 },
});

import { BIN_NIGHT, FOCUS_SHELL_COPY, withAlpha } from '@app/core';
import { CalendarIcon } from 'lucide-react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { INSET, LABEL_GAP, LEADING, ROW_MIN, TAP } from '@/theme';

import { PhotosContext } from '@/hooks/photos';

import { Avatar } from './avatar';
import { CountBadge } from './badge';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Field } from './field';
import { Fold } from './fold';
import { CardRows, Group, GroupItem } from './group';
import { LidBar } from './lid';
import { Row } from './row';
import { Section } from './section';
import { Segmented } from './segmented';
import { Chip, StatusMark } from './status-mark';
import { Body, Lead, Meta, RowTitle, SectionLabel, Title } from './text';
import { TextButton } from './text-button';
import { TickBox } from './tick-box';

// Focus's pieces. Decoration (hairlines, lid bars, badges, avatars) is hidden
// from screen readers, so queries ask for hidden elements to find it.
const HIDDEN = { includeHiddenElements: true };
const light = BIN_NIGHT.light;

describe('the type roles', () => {
  it("announce the screen's title and its sections as headings, and nothing else", async () => {
    await render(
      <>
        <Title>Today</Title>
        <Lead>Bins out</Lead>
        <Lead header>Clean the bath</Lead>
        <SectionLabel>Needs you</SectionLabel>
        <RowTitle>Hoover the stairs</RowTitle>
        <Body>Running text</Body>
        <Meta>Thu 8 Oct</Meta>
      </>,
    );
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Today', 'Clean the bath', 'Needs you']);
    expect(screen.getByText('Today')).toHaveStyle({ fontSize: 28, textTransform: 'uppercase' });
    expect(screen.getByText('Bins out')).toHaveStyle({ fontSize: 22 });
    expect(screen.getByText('Hoover the stairs')).toHaveStyle({ fontSize: 17 });
    expect(screen.getByText('Running text')).toHaveStyle({ fontSize: 16, color: light.foreground });
    expect(screen.getByText('Thu 8 Oct')).toHaveStyle({ fontSize: 14, color: light.mutedForeground });
  });
});

describe('Row', () => {
  it('is one button a thumb tall, its title on one line', async () => {
    const onPress = jest.fn();
    await render(<Row title="Bins out" meta="Thu 07:00, 2 pts" onPress={onPress} testID="row" />);
    const button = screen.getByRole('button', { name: /Bins out/ });
    expect(button).toHaveStyle({ minHeight: TAP });
    // Two lines make the row 64; one line, ROW_MIN.
    expect(screen.getByTestId('row')).toHaveStyle({ minHeight: 64 });
    expect(screen.getByText('Bins out').props.numberOfLines).toBe(1);
    // The meta line wraps onto a second rather than being cut short.
    expect(screen.getByText('Thu 07:00, 2 pts').props.numberOfLines).toBe(2);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is just words when there is nothing to press', async () => {
    await render(<Row title="Sam" testID="row" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('row')).toHaveStyle({ minHeight: ROW_MIN });
  });

  it('is a link, with a chevron, when it pushes a page', async () => {
    await render(<Row title="The Stake" href="/house/stake" chevron />);
    expect(screen.getByRole('link', { name: 'The Stake' })).toHaveProp('href', '/house/stake');
  });

  it('keeps a control in a slot out of its own press target', async () => {
    const open = jest.fn();
    const tick = jest.fn();
    await render(
      <Row
        title="Bins out"
        onPress={open}
        leading={<TickBox state="open" label="Mark Bins out done" onPress={tick} />}
        trailing={<TextButton label="Undo" onPress={jest.fn()} />}
      />,
    );
    const row = screen.getByRole('button', { name: /Bins out/ });
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Undo' })).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mark Bins out done' }));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps a control out of its press target when told so, whatever its props', async () => {
    /** A control that takes none of the props Row looks for. */
    function Reaction() {
      return <TextButton label="Thanks" onPress={jest.fn()} />;
    }
    await render(<Row title="Sam ticked the bins" onPress={jest.fn()} trailing={<Reaction />} trailingControl />);
    const row = screen.getByRole('button', { name: /Sam ticked the bins/ });
    expect(within(row).queryByRole('button', { name: 'Thanks' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thanks' })).toBeOnTheScreen();
  });

  it('leads its meta line with the lid bar, and sets a value in figures', async () => {
    await render(<Row title="Bins out" lid="bins" meta="2 pts" trailing="12" />);
    expect(screen.getByTestId('lid-bar', HIDDEN)).toHaveStyle({ backgroundColor: light.bin.bins });
    expect(screen.getByText('12')).toHaveStyle({ fontVariant: ['tabular-nums'] });
  });

  it('sets a destructive row in hazard, and an overdue John on hazard tape', async () => {
    await render(<Row title="Remove Sam" tone="hazard" hazardEdge onPress={jest.fn()} />);
    expect(screen.getByText('Remove Sam')).toHaveStyle({ color: light.hazard });
    expect(screen.getAllByTestId('hazard-tape', HIDDEN).length).toBeGreaterThan(0);
  });

  it('tints your own row', async () => {
    await render(<Row title="You" tint testID="row" />);
    expect(screen.getByTestId('row')).toHaveStyle({ backgroundColor: light.secondary });
  });

  it('is one of several to choose from when told whether it is chosen: a radio, the chosen one tinted', async () => {
    const choose = jest.fn();
    await render(
      <View accessibilityRole="radiogroup" accessibilityLabel="Their open Johns">
        <Row title="Bins out" leading={<Avatar name="Tom Reilly" />} selected={false} onPress={choose} testID="bins" />
        <Row title="Clean the bath" leading={<Avatar name="Sam Carter" />} selected onPress={choose} testID="bath" />
      </View>,
    );
    const bins = screen.getByRole('radio', { name: /Bins out/ });
    expect(bins).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Clean the bath/ })).toBeChecked();
    expect(screen.getByTestId('bins')).not.toHaveStyle({ backgroundColor: light.secondary });
    expect(screen.getByTestId('bath')).toHaveStyle({ backgroundColor: light.secondary });
    // A housemate's plate is the tint too: on the chosen row it's the card colour, so it still shows.
    const plate = (row: string) => within(screen.getByTestId(row)).getByTestId('avatar', HIDDEN);
    expect(plate('bins')).toHaveStyle({ backgroundColor: light.secondary });
    expect(plate('bath')).toHaveStyle({ backgroundColor: light.card });
    await fireEvent.press(bins);
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('lets a value in words take up to 60% of the row, on a second line past that', async () => {
    await render(<Row title="Shared by" trailing="The upstairs bathroom and the landing" />);
    const value = screen.getByText('The upstairs bathroom and the landing');
    expect(value).toHaveProp('numberOfLines', 2);
    expect(value).toHaveStyle({ flexShrink: 1, maxWidth: '60%', textAlign: 'right' });
  });

  it('gives a sentence two lines when asked', async () => {
    await render(<Row title="Megan ticked Food waste caddy out" titleLines={2} />);
    expect(screen.getByText('Megan ticked Food waste caddy out')).toHaveProp('numberOfLines', 2);
  });
});

describe('Group', () => {
  it('draws a hairline over each row from the leading edge, under an avatar too, and hides the first', async () => {
    await render(
      <Group testID="group">
        <Row title="Priya" leading={<Avatar name="Priya" me />} />
        <Row title="Sam" leading={<Avatar name="Sam" />} />
        <Row title="Rules" />
        <GroupItem>
          <Text>A form</Text>
        </GroupItem>
      </Group>,
    );
    const lines = screen.getAllByTestId('hairline', HIDDEN);
    // One each; the group clips the first, its rows sitting a hairline high.
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(StyleSheet.flatten(line.props.style)).toMatchObject({ left: INSET, right: 0, top: 0, height: StyleSheet.hairlineWidth });
    }
    const group = screen.getByTestId('group');
    expect(group).toHaveStyle({ overflow: 'hidden' });
    expect(group.children[0]).toHaveStyle({ marginTop: -StyleSheet.hairlineWidth });
  });

  it('lines up rows from fragments, lists and components that return several', async () => {
    function Pair() {
      return (
        <>
          <Row title="d" />
          <Row title="e" />
        </>
      );
    }
    await render(
      <Group>
        {['a', 'b'].map((k) => (
          <Row key={k} title={k} />
        ))}
        <>
          <Row title="c" />
        </>
        <Pair />
      </Group>,
    );
    expect(screen.getAllByTestId('hairline', HIDDEN)).toHaveLength(5);
  });

  it('draws no hairline for a row on its own', async () => {
    await render(<Row title="Sam" />);
    expect(screen.queryByTestId('hairline', HIDDEN)).toBeNull();
  });

  it("starts a card's rows at the card's own padding, a line over each", async () => {
    await render(
      <CardRows testID="rows">
        <Row title="Settle up" testID="row" />
        <Row title="Stake history" />
      </CardRows>,
    );
    const lines = screen.getAllByTestId('hairline', HIDDEN);
    expect(lines).toHaveLength(2);
    expect(StyleSheet.flatten(lines[0].props.style).left).toBe(0);
    expect(screen.getByTestId('row')).toHaveStyle({ paddingHorizontal: 0 });
    expect(screen.getByTestId('rows')).toHaveStyle({ marginTop: INSET });
  });
});

describe('Fold', () => {
  it('keeps its rows folded away until opened, and says which it is', async () => {
    await render(
      <Group>
        <Row title="Bins out" />
        <Fold label={FOCUS_SHELL_COPY.done(2)}>
          <Row title="Wipe the hob" />
          <Row title="Hoover" />
        </Fold>
      </Group>,
    );
    const fold = screen.getByRole('button', { name: 'Done (2)' });
    expect(fold).toBeCollapsed();
    expect(screen.queryByText('Wipe the hob')).toBeNull();
    await fireEvent.press(fold);
    expect(fold).toBeExpanded();
    expect(screen.getByText('Wipe the hob')).toBeOnTheScreen();
    // Each row draws its hairline, the fold's own and the opened ones too.
    const lines = screen.getAllByTestId('hairline', HIDDEN);
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => StyleSheet.flatten(line.props.style).left === INSET)).toBe(true);
  });
});

describe('Section', () => {
  it('names itself as a heading, saying its count, with its rows in one group', async () => {
    await render(
      <Section label="Needs you" count={1} right="2 of 3">
        <Row title="Vote on the bath" />
      </Section>,
    );
    expect(screen.getByRole('header', { name: 'Needs you, 1' })).toBeOnTheScreen();
    expect(screen.getByTestId('count-badge', HIDDEN)).toHaveTextContent('1');
    expect(screen.getByText('2 of 3')).toHaveStyle({ color: light.mutedForeground });
  });

  it('shows no badge with nothing to count', async () => {
    await render(
      <Section label="Who lives here" count={0}>
        <Row title="Sam" />
      </Section>,
    );
    expect(screen.getByRole('header', { name: 'Who lives here' })).toBeOnTheScreen();
    expect(screen.queryByTestId('count-badge', HIDDEN)).toBeNull();
  });

  it("puts a person's avatar before the label and a quiet tag after it", async () => {
    await render(
      <Section label="Sam" leading={<Avatar name="Sam" size={24} />} tag={<Chip label="Swap ready" testID="tag" />}>
        <Row title="Bins out" />
      </Section>,
    );
    expect(screen.getByRole('header', { name: 'Sam' })).toBeOnTheScreen();
    expect(screen.getByTestId('avatar', HIDDEN)).toHaveStyle({ width: 24 });
    expect(screen.getByTestId('tag')).toHaveStyle({ borderColor: light.border });
  });

  /** The header: the label's line, and what's on its right. */
  const header = (label: string) => screen.getByRole('header', { name: label }).parent!.parent!;

  it('keeps the label whole: words on the right move under it when the line is full, a line each', async () => {
    await render(
      <Section label="Megan" leading={<Avatar name="Megan" size={24} />} right={['1 of 3 done, 2 pts', 'away 28–31 Oct']}>
        <Row title="Bins out" />
      </Section>,
    );
    // The header wraps, rather than shrinking the label to fit the words beside it.
    expect(header('Megan')).toHaveStyle({ flexWrap: 'wrap', marginBottom: LABEL_GAP });
    const counts = screen.getByText('1 of 3 done, 2 pts');
    const away = screen.getByText('away 28–31 Oct');
    for (const line of [counts, away]) {
      expect(line).toHaveProp('numberOfLines', 1);
      expect(line).toHaveStyle({ color: light.mutedForeground, textAlign: 'right' });
    }
    // Pushed to the right, whichever line it lands on.
    expect(counts.parent).toHaveStyle({ marginLeft: 'auto', flexShrink: 1 });
    expect(away.parent).toBe(counts.parent);
  });

  it('hangs a thumb-tall control on the right over the label line, so the group sits as far under it as under any label', async () => {
    await render(
      <Section
        label="The Table"
        right={<Segmented options={[{ value: 'week', label: 'Week' }]} value="week" onChange={jest.fn()} label="Show" />}
      >
        <Row title="Priya" />
      </Section>,
    );
    // The control hangs 12 over the 24pt line, above and below: the group starts LABEL_GAP under the label, as it does under a plain one.
    expect(screen.getByLabelText('Show').parent).toHaveStyle({ marginVertical: -(TAP - 24) / 2 });
    expect(header('The Table')).toHaveStyle({ marginBottom: LABEL_GAP });
    expect(header('The Table')).not.toHaveStyle({ flexWrap: 'wrap' });
    // Its foot (12 below the line) reaches into the group (LABEL_GAP below it), so the header is drawn over the
    // group, a later sibling: the control is seen whole, and a tap on its foot is the control's, not the first row's.
    expect(header('The Table')).toHaveStyle({ zIndex: 1 });
  });
});

describe('Chip', () => {
  it('is quiet ink on a hairline edge, or hazard words on a hazard edge, never filled', async () => {
    await render(
      <>
        <Chip label="Swap ready" testID="quiet" />
        <Chip label="Late" tone="hazard" testID="hazard" />
      </>,
    );
    expect(screen.getByTestId('quiet')).toHaveStyle({ borderColor: light.border });
    expect(screen.getByText('Swap ready')).toHaveStyle({ color: light.foreground });
    expect(screen.getByTestId('hazard')).toHaveStyle({ borderColor: light.hazard });
    expect(screen.getByText('Late')).toHaveStyle({ color: light.hazard });
    expect(screen.getByTestId('hazard')).not.toHaveStyle({ backgroundColor: light.hazard });
  });
});

describe('TickBox', () => {
  it('is a checkbox a thumb wide, checked once ticked', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<TickBox state="open" label="Mark Bins done" onPress={onPress} />);
    const box = screen.getByRole('checkbox', { name: 'Mark Bins done' });
    expect(box).toHaveStyle({ width: TAP, height: TAP });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onPress).toHaveBeenCalledTimes(1);

    await rerender(<TickBox state="checking" label="Undo" onPress={onPress} />);
    expect(screen.getByRole('checkbox', { name: 'Undo' })).toBeChecked();
  });

  it('is busy, and not pressable, while a tick is on its way', async () => {
    const onPress = jest.fn();
    await render(<TickBox state="busy" label="Mark Bins done" onPress={onPress} />);
    const box = screen.getByRole('checkbox');
    expect(box).toBeBusy();
    expect(box).toBeDisabled();
  });

  it("is a square plate with the sign's border, green only once it's done, green at 40% while it's checked, hazard disputed", async () => {
    const { rerender } = await render(<TickBox state="done" label="Done" />);
    // Without a press, a picture of the state.
    const box = () => screen.getByTestId('tick-box');
    expect(box()).toHaveStyle({ backgroundColor: light.good, width: LEADING - 4, height: LEADING - 4, borderRadius: 5, borderWidth: 3 });
    await rerender(<TickBox state="checking" label="Checking" />);
    expect(box()).toHaveStyle({ backgroundColor: withAlpha(light.good, 0.4), borderColor: light.good });
    await rerender(<TickBox state="disputed" label="Disputed" />);
    expect(box()).toHaveStyle({ backgroundColor: 'transparent', borderColor: light.hazard });
    await rerender(<TickBox state="open" label="Open" />);
    expect(box()).toHaveStyle({ backgroundColor: 'transparent', borderColor: light.mutedForeground });
    expect(screen.getByRole('image', { name: 'Open' })).toBeOnTheScreen();
  });

  it('counts a disputed tick as ticked', async () => {
    await render(<TickBox state="disputed" label="Disputed" onPress={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Disputed' })).toBeChecked();
  });
});

describe('StatusMark', () => {
  it('shows nothing for an upcoming John', async () => {
    await render(<StatusMark status="upcoming" />);
    expect(screen.toJSON()).toBeNull();
  });

  it('outlines the hazard words in hazard, never filled', async () => {
    await render(<StatusMark status="overdue" />);
    expect(screen.getByTestId('status-overdue')).toHaveStyle({ borderColor: light.hazard });
    expect(screen.getByText('Overdue')).toHaveStyle({ color: light.hazard });
  });

  it('marks done with a green tick and the word in ink', async () => {
    await render(<StatusMark status="done" />);
    expect(screen.getByText('Done')).toHaveStyle({ color: light.foreground });
    expect(screen.getByTestId('status-done')).toHaveStyle({ borderColor: 'transparent' });
  });

  it('keeps the quiet ones quiet', async () => {
    await render(<StatusMark status="checking" />);
    expect(screen.getByTestId('status-checking')).toHaveStyle({ borderColor: light.border });
    expect(screen.getByText('Checking')).toHaveStyle({ color: light.foreground });
  });
});

describe('Segmented', () => {
  it('is a named radio group, the chosen part checked', async () => {
    const onChange = jest.fn();
    await render(
      <Segmented
        label="Standings"
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Oct' },
        ]}
        value="week"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Standings')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Oct' })).toHaveStyle({ minHeight: TAP });
    await fireEvent.press(screen.getByRole('radio', { name: 'Week' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Oct' }));
    expect(onChange).toHaveBeenCalledWith('month');
    // At its own width, each part at least a thumb wide.
    expect(screen.getByLabelText('Standings')).toHaveStyle({ alignSelf: 'flex-start' });
    expect(screen.getByRole('radio', { name: 'Oct' })).toHaveStyle({ minWidth: TAP });
  });

  it('shares the width equally when asked, each part saying its whole name', async () => {
    await render(
      <Segmented
        equal
        label="Weeks start on"
        options={[
          { value: 1, label: 'Mon', spoken: 'Monday' },
          { value: 7, label: 'Sun', spoken: 'Sunday' },
        ]}
        value={1}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Weeks start on')).toHaveStyle({ alignSelf: 'stretch' });
    const monday = screen.getByRole('radio', { name: 'Monday' });
    expect(monday).toBeChecked();
    expect(monday).toHaveTextContent('Mon');
    // However narrow, so seven days fit across a phone, and still a thumb tall.
    expect(monday).toHaveStyle({ flex: 1, minWidth: 0, minHeight: TAP });
    expect(screen.getByRole('radio', { name: 'Sunday' })).not.toBeChecked();
  });
});

describe('TextButton', () => {
  it('is a thumb-tall button of words', async () => {
    const onPress = jest.fn();
    await render(<TextButton label="Undo" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toHaveStyle({ minHeight: TAP });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a link with one flat style', async () => {
    await render(<TextButton label="See all" href="/house/wall" chevron align="end" />);
    const link = screen.getByRole('link', { name: 'See all' });
    expect(link).toHaveProp('href', '/house/wall');
    expect(Array.isArray(link.props.style)).toBe(false);
  });

  it('sets a destructive one in hazard, and does nothing disabled', async () => {
    const onPress = jest.fn();
    await render(<TextButton label="Leave the house" tone="hazard" disabled onPress={onPress} />);
    expect(screen.getByText('Leave the house')).toHaveStyle({ color: light.hazard });
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Button', () => {
  it('says which of a pair is chosen, on the tint with an ink edge, never amber', async () => {
    await render(
      <>
        <Button label="Keep it" variant="outline" chosen onPress={jest.fn()} />
        <Button label="Strike it out" variant="outline" chosen={false} onPress={jest.fn()} />
      </>,
    );
    const chosen = screen.getByRole('button', { name: 'Keep it' });
    expect(chosen).toBeSelected();
    expect(chosen).toHaveStyle({ backgroundColor: light.secondary, borderColor: light.foreground });
    const other = screen.getByRole('button', { name: 'Strike it out' });
    expect(other).not.toBeSelected();
    expect(other).toHaveStyle({ borderColor: light.mutedForeground });
  });

  it('edges a hazard choice in hazard with the words in ink, and is disabled out loud', async () => {
    const onPress = jest.fn();
    await render(<Button label="Leave" variant="hazard" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Leave' });
    expect(button).toHaveStyle({ borderColor: light.hazard, backgroundColor: 'transparent' });
    expect(screen.getByText('Leave')).toHaveStyle({ color: light.foreground, fontSize: 17 });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Field and Alert', () => {
  it('says what to fix in ink after a triangle, never hazard, and edges the box in ink', async () => {
    await render(<Field label="House name" problem="Give the house a name." value="" onChangeText={jest.fn()} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Give the house a name.')).toHaveStyle({ color: light.foreground, fontSize: 14 });
    expect(screen.getByLabelText('House name')).toHaveStyle({ borderColor: light.foreground });
  });

  it('gives a hint in Meta while nothing is wrong', async () => {
    await render(<Field label="House name" hint="What you call it" value="" onChangeText={jest.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('What you call it')).toHaveStyle({ color: light.mutedForeground });
    expect(screen.getByLabelText('House name')).toHaveStyle({ borderColor: light.mutedForeground });
  });
});

describe('EmptyState', () => {
  it('says there is nothing yet under a heading, with one thing to do', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        icon={CalendarIcon}
        title="Not dealt yet"
        body="The admin deals the week."
        action={<Button label="Deal this week" onPress={onPress} />}
      />,
    );
    expect(screen.getByRole('header', { name: 'Not dealt yet' })).toBeOnTheScreen();
    expect(screen.getByText('The admin deals the week.')).toHaveStyle({ color: light.mutedForeground });
    await fireEvent.press(screen.getByRole('button', { name: 'Deal this week' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('the small marks', () => {
  it('counts on an ink pill, and shows nothing at zero', async () => {
    const { rerender } = await render(<CountBadge count={2} />);
    expect(screen.getByTestId('count-badge', HIDDEN)).toHaveStyle({ backgroundColor: light.foreground });
    await rerender(<CountBadge count={0} />);
    expect(screen.queryByTestId('count-badge', HIDDEN)).toBeNull();
  });

  it('puts your initials on an ink plate, everyone else on the tint', async () => {
    await render(
      <>
        <Avatar name="Priya Patel" me />
        <Avatar name="Sam" />
      </>,
    );
    expect(screen.getByTestId('avatar-me', HIDDEN)).toHaveStyle({ backgroundColor: light.foreground, borderRadius: 16 });
    expect(screen.getByTestId('avatar', HIDDEN)).toHaveStyle({ backgroundColor: light.secondary });
    expect(screen.getByText('PP', HIDDEN)).toHaveStyle({ color: light.card });
  });

  it("shows a housemate's sign-in photo, and their initials without one or when it won't load", async () => {
    const photo = 'https://lh3.googleusercontent.com/a/priya=s96-c';
    await render(
      <PhotosContext.Provider value={new Map([['priya', photo]])}>
        <Avatar name="Priya Patel" userId="priya" me />
        <Avatar name="Sam Carter" userId="sam" />
      </PhotosContext.Provider>,
    );
    const image = screen.getByTestId('avatar-photo', HIDDEN);
    expect(image.props.source).toEqual({ uri: photo });
    // The initials hold the plate under it, and it fades in over them once loaded.
    expect(screen.getByText('PP', HIDDEN)).toBeTruthy();
    expect(screen.getByText('SC', HIDDEN)).toBeTruthy();

    await fireEvent(image, 'error');
    expect(screen.queryByTestId('avatar-photo', HIDDEN)).toBeNull();
    expect(screen.getByText('PP', HIDDEN)).toBeTruthy();
  });

  it("dots a John's lid colour", async () => {
    await render(<LidBar category="floors" />);
    expect(screen.getByTestId('lid-bar', HIDDEN)).toHaveStyle({ backgroundColor: light.bin.floors });
  });
});

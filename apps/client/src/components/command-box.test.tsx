import { CATEGORY_LABEL, NEW_JOHN, startingKinds, wordsFor, type JohnDef } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CommandCard, type CommandGroup } from '@/components/command-box';
import { commandGroups, type CommandHouse, type CommandTo } from '@/components/shell/command-hits';

const words = wordsFor('en', 'housemates');

const john = (id: string, name: string, kindId: string | null): JohnDef => ({ ...NEW_JOHN, id, name, kindId, anchorMonth: null });

const HOUSE: CommandHouse = {
  userId: 'me',
  family: false,
  kid: false,
  people: [
    { userId: 'me', name: 'Alex Bin' },
    { userId: 'sam', name: 'Sam Ortiz' },
  ],
  johns: [john('bins', 'Bins out', 'bins'), john('hob', 'Wipe the hob', null)],
  kinds: startingKinds(CATEGORY_LABEL),
};

const nowhere: CommandTo = { href: jest.fn(), john: jest.fn() };
const found = (query: string, house: CommandHouse = HOUSE, to: CommandTo = nowhere) => commandGroups({ query, house, to }, words);
const titles = (groups: readonly CommandGroup[]) => groups.map((g) => [g.label, g.hits.map((h) => h.title)]);

describe('commandGroups', () => {
  it('lists every page with nothing typed, each under the place it is in', () => {
    const groups = found('');
    expect(groups.map((g) => g.label)).toEqual(['Pages']);
    const pages = groups[0]!.hits;
    expect(pages.map((p) => p.title)).toEqual([
      'Today',
      'This week',
      'Track record',
      'House',
      'The John list',
      'House rules',
      'Days and time away',
      'The Wall',
      'Stake history',
      'House Pass',
      'Guide',
      'You',
    ]);
    expect(pages.find((p) => p.title === 'Track record')?.meta).toBe('Week');
    expect(pages.find((p) => p.title === 'Today')?.meta).toBeUndefined();
  });

  it('finds Johns, then housemates, then pages, by the start of a word', () => {
    expect(titles(found('b'))).toEqual([
      ['Johns', ['Bins out']],
      ['Housemates', ['Alex Bin']],
    ]);
    expect(titles(found('the'))).toEqual([
      ['Johns', ['Wipe the hob']],
      ['Pages', ['The John list', 'The Wall']],
    ]);
    expect(found('zz')).toEqual([]);
  });

  it("gives a John its kind, a John in none No kind, and says which of the people is you", () => {
    const [johns, people] = found('b');
    expect(johns!.hits[0]).toMatchObject({ meta: 'Bins & recycling', lid: HOUSE.kinds.find((k) => k.id === 'bins')!.colour });
    expect(found('hob')[0]!.hits[0]).toMatchObject({ meta: 'No kind', lid: 'other' });
    expect(people!.hits[0]!.meta).toBe('You');
  });

  it('leaves out the Stake in a family, and the Pass for a kid', () => {
    const pages = (house: CommandHouse) => found('', house)[0]!.hits.map((p) => p.title);
    expect(pages({ ...HOUSE, family: true })).not.toContain('Stake history');
    expect(pages({ ...HOUSE, family: true, kid: true })).not.toContain('House Pass');
  });

  it('sends a page to its address, a John to its own opener and a housemate to their page', () => {
    const to = { href: jest.fn(), john: jest.fn() };
    found('track', HOUSE, to)[0]!.hits[0]!.go();
    expect(to.href).toHaveBeenLastCalledWith('/week/record');
    found('bins', HOUSE, to)[0]!.hits[0]!.go();
    expect(to.john).toHaveBeenCalledWith('bins');
    found('sam', HOUSE, to)[0]!.hits[0]!.go();
    expect(to.href).toHaveBeenLastCalledWith('/house/people/sam');
  });
});

describe('CommandCard', () => {
  const card = (query: string, onClose = jest.fn()) => (
    <CommandCard query={query} onQuery={jest.fn()} groups={found(query)} placeholder="Search" none={`Nothing matches “${query}”`} onClose={onClose} autoFocus={false} />
  );
  const key = (name: string) => fireEvent(screen.getByTestId('command-input'), 'keyPress', { nativeEvent: { key: name }, preventDefault: jest.fn() });

  it('names its groups, and tints the first hit, which the arrows move', async () => {
    await render(card('b'));
    // Seen over each group; heard as the group's name.
    expect(screen.getByText('Johns', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Housemates', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Bins out, Bins & recycling');
    await key('ArrowDown');
    expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Alex Bin, You');
    // It stops at the last, and at the first.
    await key('ArrowDown');
    expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Alex Bin, You');
    await key('ArrowUp');
    await key('ArrowUp');
    expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Bins out, Bins & recycling');
  });

  it('opens the tinted hit on Enter, and goes away on Esc', async () => {
    const onClose = jest.fn();
    const to = { href: jest.fn(), john: jest.fn() };
    await render(<CommandCard query="b" onQuery={jest.fn()} groups={found('b', HOUSE, to)} placeholder="Search" none="" onClose={onClose} autoFocus={false} />);
    await key('ArrowDown');
    await key('Enter');
    expect(to.href).toHaveBeenCalledWith('/house/people/me');
    await key('Escape');
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when nothing matches', async () => {
    await render(card('zz'));
    expect(screen.getByText('Nothing matches “zz”')).toBeOnTheScreen();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

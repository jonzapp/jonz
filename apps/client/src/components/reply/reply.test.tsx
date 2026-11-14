import { NEW_JOHN, REPLY_SAMPLES, type BoardItem, type JohnDef } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { findJohn, findPerson, replyPieces, type ReplyData } from './pieces';
import { NO_PIECES, Reply } from './reply';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// The live week card's rows tick through the app's API; nothing here ticks.
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));

const sample = (id: string) => REPLY_SAMPLES.find((s) => s.id === id)!.reply;

const john = (id: string, name: string, kindId: string): JohnDef => ({ ...NEW_JOHN, id, name, kindId, anchorMonth: null });
const DATA: ReplyData = {
  viewerId: 'u-glyn',
  people: [
    { userId: 'u-glyn', name: 'Glyn Finck' },
    { userId: 'u-priya', name: 'Priya Shah' },
    { userId: 'u-sam', name: 'Sam Ortiz' },
  ],
  johns: [john('0000000a-1111-4000-8000-000000000000', 'Bins out', 'bins'), john('0000000b-2222-4000-8000-000000000000', 'Bathroom clean', 'bathroom')],
  groups: [],
  items: null,
  rowContext: null,
  balances: null,
  awayMakeup: 100,
};

/** A John dealt this week, as the board has it: only the fields a reply's lookups read. */
const item = (id: string, johnId: string, userId: string, done = false): BoardItem =>
  ({ id, johnId, userId, name: 'x', dueAt: new Date(Date.UTC(2026, 10, 5, 18)), doneAt: done ? new Date(Date.UTC(2026, 10, 5, 12)) : null, outcome: null }) as BoardItem;

describe('Reply', () => {
  beforeEach(() => jest.mocked(router.push).mockClear());

  it('draws plain words as they are', async () => {
    await render(<Reply source="Any time." />);
    expect(screen.getByText('Any time.')).toBeTruthy();
  });

  it('shows no Markdown marks, whatever the sample', async () => {
    for (const s of REPLY_SAMPLES) {
      const { unmount } = await render(<Reply source={s.reply} pieces={replyPieces(DATA, words)} testID="reply" />);
      const all = screen.getByTestId('reply');
      const drawn = (function text(node: unknown): string {
        if (typeof node === 'string') return node;
        const n = node as { children?: unknown[] };
        return (n.children ?? []).map(text).join('');
      })(all);
      // Raw HTML the model typed stays as the words it is; everything else is drawn, not shown.
      const shown = drawn.replace('<b>raw HTML</b>', '').replace('< 5 pts > 2 pts', '').replace('**Unclosed', 'Unclosed');
      expect({ id: s.id, marks: shown.match(/\*\*|__|::|\]\(|^#+ |\| --- \||```/gm) }).toEqual({ id: s.id, marks: null });
      await unmount();
    }
  });

  it('draws headings as headings and lists as lists, numbered from where they start', async () => {
    await render(<Reply source={sample('howto')} />);
    expect(screen.getByRole('header', { name: 'Book time away' })).toBeTruthy();
    expect(screen.getAllByTestId('reply-li')).toHaveLength(3);
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('3.')).toBeTruthy();
  });

  it('says whether each task is done', async () => {
    await render(<Reply source={sample('checklist')} />);
    expect(screen.getAllByLabelText('Done')).toHaveLength(1);
    expect(screen.getAllByLabelText('To do')).toHaveLength(3);
  });

  it('draws a table with every cell', async () => {
    await render(<Reply source={sample('table')} />);
    expect(screen.getByTestId('reply-table')).toBeTruthy();
    for (const cell of ['Person', 'Given', 'Done', 'Priya', '25', '21']) expect(screen.getByText(cell)).toBeTruthy();
  });

  it('makes chips of what the house has, each named for a screen reader, and opens them', async () => {
    await render(<Reply source={sample('howto')} pieces={replyPieces(DATA, words)} />);
    const page = screen.getByRole('link', { name: 'Days and time away, page' });
    await fireEvent.press(page);
    expect(router.push).toHaveBeenCalledWith('/house/away');
    await fireEvent.press(screen.getByRole('link', { name: 'Bins out, John' }));
    expect(router.push).toHaveBeenLastCalledWith('/house/johns');
  });

  it("opens a John's sheet when it's on this week's board, yours first", async () => {
    const openJohn = jest.fn();
    const items = [item('a-sam', DATA.johns[0].id, 'u-sam'), item('a-me', DATA.johns[0].id, 'u-glyn')];
    await render(<Reply source="[Bins](jonz:john/0000000a)" pieces={replyPieces({ ...DATA, items, openJohn }, words)} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bins out, John' }));
    expect(openJohn).toHaveBeenCalledWith('a-me');
    expect(router.push).not.toHaveBeenCalled();
  });

  it("draws a chip it can't find as its words, in bold, and nothing to tap", async () => {
    await render(<Reply source="Ask [Zed](jonz:person/Zed) about [Oven](jonz:john/ffffffff)" pieces={replyPieces(DATA, words)} />);
    expect(screen.getByText('Zed')).toBeTruthy();
    expect(screen.getByText('Oven')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws the cards the pieces give, and leaves out the ones they have no data for', async () => {
    const card = jest.fn(() => null);
    await render(<Reply source={sample('week')} pieces={{ ...NO_PIECES, card }} />);
    expect(card.mock.calls).toEqual([[{ card: 'week', who: null, open: true }], [{ card: 'shares' }]]);
    expect(screen.queryByTestId('reply-card-week')).toBeNull();
  });

  it('never makes a web link tappable', async () => {
    await render(<Reply source={sample('messy')} pieces={replyPieces(DATA, words)} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/raw HTML/)).toBeTruthy();
  });
});

describe('replyPieces', () => {
  it('finds a John by its ref, then by its name', () => {
    expect(findJohn(DATA, '0000000b')?.name).toBe('Bathroom clean');
    expect(findJohn(DATA, '0000000B')?.name).toBe('Bathroom clean');
    expect(findJohn(DATA, 'bins OUT')?.name).toBe('Bins out');
    expect(findJohn(DATA, 'ffffffff')).toBeNull();
  });

  it('finds people by first or full name, and "me" as the person asking', () => {
    expect(findPerson(DATA, 'me')?.userId).toBe('u-glyn');
    expect(findPerson(DATA, 'You')?.userId).toBe('u-glyn');
    expect(findPerson(DATA, 'priya')?.userId).toBe('u-priya');
    expect(findPerson(DATA, 'Sam Ortiz')?.userId).toBe('u-sam');
    expect(findPerson(DATA, 'Zed')).toBeNull();
  });

  it("gives no week card before the board is read, or for someone who isn't in the house", () => {
    const pieces = replyPieces(DATA, words);
    expect(pieces.card({ card: 'week', who: null, open: false })).toBeNull();
    const withBoard = replyPieces({ ...DATA, items: [], rowContext: {} as never }, words);
    expect(withBoard.card({ card: 'week', who: 'Zed', open: false })).toBeNull();
    expect(withBoard.card({ card: 'week', who: 'Priya', open: false })).not.toBeNull();
  });

  it('gives no fair shares before they are read', () => {
    expect(replyPieces(DATA, words).card({ card: 'shares' })).toBeNull();
    expect(replyPieces({ ...DATA, balances: [{ userId: 'u-glyn', balance: 0 }] }, words).card({ card: 'shares' })).not.toBeNull();
  });

  it("knows the app's pages and no others", () => {
    const pieces = replyPieces(DATA, words);
    expect(pieces.page('away')?.href).toBe('/house/away');
    expect(pieces.page('admin')).toBeNull();
  });
});

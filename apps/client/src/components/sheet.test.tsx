import { BIN_NIGHT } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { SIGN_TAPE } from '@/components/hazard-tape';
import { measureAt, measureNowhere } from '@/testing/layout';
import { LookContext, RAIL, SPACE } from '@/theme';

import { Sheet, SheetAnchor, SheetRailContext } from './sheet';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

// A Modal that, like react-native-web's, stays in the tree while it closes
// (it slides out first), so the test can see whether the sheet let it go. It
// passes on what names the dialog, as react-native-web's does.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ visible, children, 'aria-label': label }: { visible: boolean; children: unknown; 'aria-label'?: string }) =>
      createElement(View, { testID: visible ? 'modal-open' : 'modal-closing', 'aria-label': label }, children),
  };
});
// A phone unless a test says otherwise.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));
const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const sheet = (visible: boolean) => (
  <Sheet visible={visible} title="Make a group" onClose={jest.fn()}>
    <Text>The form</Text>
  </Sheet>
);

beforeEach(() => (useWindowDimensions as jest.Mock).mockReturnValue(PHONE));
afterEach(() => jest.restoreAllMocks());

it('shows its title and its form while open', async () => {
  await render(sheet(true));
  expect(screen.getByTestId('modal-open')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Make a group' })).toBeOnTheScreen();
  expect(screen.getByText('The form')).toBeOnTheScreen();
});

it('on a phone, stays to slide out as it closes', async () => {
  const { rerender } = await render(sheet(true));
  await rerender(sheet(false));
  expect(screen.getByTestId('modal-closing')).toBeOnTheScreen();
});

it('on the web, is gone the moment it closes, so it holds on to no focus', async () => {
  // react-native-web keeps a closing Modal, and its hold on focus, until the
  // slide out ends: typing into the next sheet would land on this one instead.
  jest.replaceProperty(Platform, 'OS', 'web');
  const { rerender } = await render(sheet(true));
  expect(screen.getByTestId('modal-open')).toBeOnTheScreen();
  await rerender(sheet(false));
  expect(screen.queryByTestId('modal-closing')).toBeNull();
  expect(screen.queryByText('Make a group')).toBeNull();
});

it('is a dialog named by its title, or by what it says it is', async () => {
  const { rerender } = await render(sheet(true));
  expect(screen.getByTestId('modal-open')).toHaveAccessibleName('Make a group');
  await rerender(
    <Sheet visible label="Clean the bathroom" onClose={jest.fn()}>
      <Text>The John</Text>
    </Sheet>,
  );
  expect(screen.getByTestId('modal-open')).toHaveAccessibleName('Clean the bathroom');
});

it('keeps the scrim to a pointer: out of the focus order and the accessibility tree, so focus lands in the sheet', async () => {
  const onClose = jest.fn();
  await render(
    <Sheet visible title="Make a group" onClose={onClose}>
      <Text>The form</Text>
    </Sheet>,
  );
  const scrim = screen.getByTestId('sheet-scrim', { includeHiddenElements: true });
  expect(scrim).toHaveProp('aria-hidden', true);
  expect(scrim).not.toHaveProp('focusable');
  expect(scrim).not.toHaveProp('tabIndex');
  expect(scrim).not.toHaveProp('onPress');
  // The one thing named Close is the sheet's own button, inside it.
  expect(screen.getAllByLabelText(words('common.shell.close'))).toHaveLength(1);
  await fireEvent(scrim, 'responderRelease');
  expect(onClose).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: words('common.shell.close') }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('dims the whole window behind it, not just the column above the sheet', async () => {
  await render(sheet(true));
  expect(screen.getByTestId('sheet-scrim', { includeHiddenElements: true })).toHaveStyle({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
});

it('on a phone, rises from the bottom with a grabber', async () => {
  await render(
    <Sheet visible title="Make a group" onClose={jest.fn()} testID="group-sheet">
      <Text>The form</Text>
    </Sheet>,
  );
  const panel = screen.getByTestId('group-sheet');
  expect(panel).toHaveStyle({ width: '100%', maxWidth: 512, alignSelf: 'center', borderTopLeftRadius: 16 });
  expect(panel).not.toHaveStyle({ borderRadius: 16 });
  expect(panel.parent).toHaveStyle({ justifyContent: 'flex-end' });
});

it('carries the front door tape across its top only when it is a brand moment', async () => {
  const { rerender } = await render(sheet(true));
  expect(screen.queryByTestId('hazard-tape', { includeHiddenElements: true })).toBeNull();
  await rerender(
    <Sheet visible title="Invite housemates" onClose={jest.fn()} tape testID="invite-sheet">
      <Text>The code</Text>
    </Sheet>,
  );
  expect(screen.getByTestId('hazard-tape', { includeHiddenElements: true })).toHaveStyle({ height: SIGN_TAPE });
  expect(screen.getByTestId('invite-sheet')).toHaveStyle({ paddingTop: SIGN_TAPE + SPACE.sm });
});

describe('on a wide window', () => {
  beforeEach(() => (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP));

  it('is a capped dialog in the middle of the page beside the rail, with no grabber', async () => {
    await render(
      <SheetRailContext.Provider value={RAIL}>
        <Sheet visible title="Make a group" onClose={jest.fn()} testID="group-sheet">
          <Text>The form</Text>
        </Sheet>
      </SheetRailContext.Provider>,
    );
    const panel = screen.getByTestId('group-sheet');
    expect(panel).toHaveStyle({ width: '100%', maxWidth: 512, alignSelf: 'center', borderRadius: 16 });
    // What it sits in centres it, past the rail.
    expect(panel.parent).toHaveStyle({ justifyContent: 'center', paddingLeft: RAIL });
  });

  it('centres on the window where there is no rail', async () => {
    await render(
      <Sheet visible title="Make a group" onClose={jest.fn()} testID="group-sheet">
        <Text>The form</Text>
      </Sheet>,
    );
    expect(screen.getByTestId('group-sheet').parent).toHaveStyle({ justifyContent: 'center', paddingLeft: 0 });
  });
});

it('starts a long title where a short one starts, beside the close button at the top', async () => {
  await render(sheet(true));
  const title = screen.getByRole('header', { name: 'Make a group' });
  // (48 - 28) / 2: where a one-line Lead sits in the middle of the close button's 48.
  expect(title).toHaveStyle({ paddingTop: 10 });
  expect(title.parent).toHaveStyle({ alignItems: 'flex-start' });
});

it('marks its edge in the dark, where the scrim and the sheet are nearly one colour, over the content, taking none of its room', async () => {
  const at = (look: 'light' | 'dark') => (
    <LookContext.Provider value={look}>
      <Sheet visible title="Make a group" onClose={jest.fn()} testID="group-sheet">
        <Text>The form</Text>
      </Sheet>
    </LookContext.Provider>
  );
  const { rerender } = await render(at('dark'));
  const edge = screen.getByTestId('sheet-edge', { includeHiddenElements: true });
  expect(edge).toHaveStyle({ position: 'absolute', borderTopWidth: StyleSheet.hairlineWidth, borderColor: BIN_NIGHT.dark.border });
  expect(screen.getByTestId('group-sheet')).not.toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth });
  await rerender(at('light'));
  expect(screen.queryByTestId('sheet-edge', { includeHiddenElements: true })).toBeNull();
});

describe('opening at an anchor', () => {
  // Jest lays nothing out: say where the anchor is, and watch the scroll
  // (Jest's ScrollViews share one scrollTo mock, so it's cleared before each test).
  let scrollTo: jest.SpyInstance;
  beforeEach(() => {
    measureAt(600);
    scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    scrollTo.mockClear();
  });
  afterEach(measureNowhere);

  const anchored = (visible: boolean, openAt?: string) => (
    <Sheet visible={visible} title="Clean the bathroom" onClose={jest.fn()} openAt={openAt}>
      <Text>Mark done</Text>
      <SheetAnchor name="cant">
        <Text>If you can’t</Text>
      </SheetAnchor>
    </Sheet>
  );

  /** The sheet is 500 tall and its content 1200, and the anchor has been laid out. */
  async function layOut() {
    await fireEvent(screen.getByTestId('sheet-scroll'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } } });
    await fireEvent(screen.getByTestId('sheet-scroll'), 'contentSizeChange', 390, 1200);
    await fireEvent(screen.getByTestId('sheet-anchor-cant'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
  }

  it('scrolls the anchor it names into view, a little below the top, once', async () => {
    await render(anchored(true, 'cant'));
    await layOut();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 600 - 16, animated: false });
    // Laid out again (its content changed): the scroll is the reader's now.
    await layOut();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('never scrolls past the end of the content', async () => {
    measureAt(820);
    await render(anchored(true, 'cant'));
    await layOut();
    expect(scrollTo).toHaveBeenCalledWith({ y: 1200 - 500, animated: false });
  });

  it('stays at the top when it opens for nothing in particular', async () => {
    await render(anchored(true));
    await layOut();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls there again the next time it opens', async () => {
    const { rerender } = await render(anchored(true, 'cant'));
    await layOut();
    await rerender(anchored(false, 'cant'));
    await rerender(anchored(true, 'cant'));
    await layOut();
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});

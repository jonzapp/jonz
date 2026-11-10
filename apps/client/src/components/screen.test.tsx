import { BIN_NIGHT } from '@app/core';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { ASIDE, CONTENT_MAX, GUTTER } from '@/theme';

import { Columns, Screen } from './screen';
import { TitleBar } from './title-bar';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));

const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const routes = {
  rules: () => (
    <Screen bar={<TitleBar title="House rules" />}>
      <Text>One column</Text>
    </Screen>
  ),
  today: () => (
    <Screen bar={<TitleBar title="Today" />} spreads>
      <Columns main={<Text>Next up</Text>} side={<Text>This week</Text>} />
    </Screen>
  ),
};

/** The scrolling page's content, as one style. */
function page() {
  return StyleSheet.flatten(screen.getByTestId('page-scroll').props.contentContainerStyle);
}

/** The title bar's line of words and buttons, as one style. */
function bar() {
  const inner = screen.getByTestId('title-bar').children[0];
  return StyleSheet.flatten(typeof inner === 'string' ? undefined : inner.props.style);
}

it('on a phone, centres the page and lines the title bar up with it', async () => {
  await renderRouter(routes, { initialUrl: '/rules' });
  expect(page()).toMatchObject({ alignSelf: 'center', maxWidth: CONTENT_MAX });
  expect(bar()).toMatchObject({ maxWidth: CONTENT_MAX });
});

it("from a laptop's width, starts a page in one column at its leading edge, under a bar across the page", async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await renderRouter(routes, { initialUrl: '/rules' });
  expect(page()).toMatchObject({ alignSelf: 'flex-start', maxWidth: CONTENT_MAX });
  expect(bar().maxWidth).toBeUndefined();
});

it('fills the page with two columns, the side a panel docked to the right edge', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await renderRouter(routes, { initialUrl: '/today' });
  expect(page().maxWidth).toBeUndefined();
  expect(page()).toMatchObject({ paddingRight: 0, paddingBottom: 0 });
  // The main column runs to the panel at any width: nothing holds it short, leaving the room between them blank.
  expect(StyleSheet.flatten(screen.getByTestId('column-main').props.style).maxWidth).toBeUndefined();
  expect(screen.getByTestId('column-side')).toHaveStyle({
    width: ASIDE + 2 * GUTTER,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: BIN_NIGHT.light.border,
  });
  expect(bar().maxWidth).toBeUndefined();
});

it('scrolls each column on its own, over a page that holds still', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await renderRouter(routes, { initialUrl: '/today' });
  // The columns lie over the whole page, so the page's own scroll has nothing to scroll.
  expect(screen.getByTestId('columns')).toHaveStyle({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 });
  // The list and the panel are each a scroll of their own, the list reaching the panel.
  const main = screen.getByTestId('column-main-scroll');
  const side = screen.getByTestId('column-side');
  expect(main.type).toBe('RCTScrollView');
  expect(side.type).toBe('RCTScrollView');
  expect(main).toHaveStyle({ flex: 1 });
  expect(within(main).getByText('Next up')).toBeVisible();
  expect(within(side).getByText('This week')).toBeVisible();
  expect(within(main).queryByText('This week')).toBeNull();
});

it('reads more when the main column nears its end, and pulls to refresh there, in two columns', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  const onNearEnd = jest.fn();
  const onRefresh = jest.fn();
  await renderRouter(
    {
      wall: () => (
        <Screen bar={<TitleBar title="Wall" />} spreads onNearEnd={onNearEnd} onRefresh={onRefresh}>
          <Columns main={<Text>Entries</Text>} side={<Text>Panel</Text>} />
        </Screen>
      ),
    },
    { initialUrl: '/wall' },
  );
  expect(screen.getByTestId('page-scroll').props.refreshControl).toBeUndefined();
  expect(screen.getByTestId('column-main-scroll').props.refreshControl.props.onRefresh).toBe(onRefresh);
  await fireEvent.scroll(screen.getByTestId('column-main-scroll'), {
    nativeEvent: { contentOffset: { y: 300 }, contentSize: { height: 1200 }, layoutMeasurement: { height: 800 } },
  });
  expect(onNearEnd).toHaveBeenCalled();
});

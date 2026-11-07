import { FOCUS_SHELL_COPY, HOUSE_DRAFT_COPY, SECTION_LABEL } from '@app/core';
import { Link } from 'expo-router';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { View } from 'react-native';

import { TAP } from '@/theme';

import { MoreButton, TitleBar } from './title-bar';

const more = jest.fn();
const chats = jest.fn();
const toChat = jest.fn();

const routes = {
  'house/index': () => (
    <View>
      <TitleBar title="Flat 3" sub="2 housemates" right={<MoreButton onPress={more} />} />
      <Link href="/house/wall">To the Wall</Link>
    </View>
  ),
  'house/wall': () => <TitleBar title="The Wall" back="/house" />,
  today: () => <TitleBar title="Today" ask />,
  week: () => <TitleBar title="This week" right={<MoreButton onPress={more} />} ask />,
  ask: () => <TitleBar title="Ask Jonz" lead={<MoreButton onPress={chats} testID="chats" />} right={<MoreButton onPress={more} />} />,
  chats: () => <TitleBar title="Your chats" onBack={toChat} backLabel="Ask Jonz" />,
};

it("is the screen's one heading", async () => {
  await renderRouter(routes, { initialUrl: '/today' });
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getAllByRole('header')).toHaveLength(1);
  expect(bar.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
  expect(bar.queryByRole('button', { name: FOCUS_SHELL_COPY.back })).toBeNull();
});

it("keeps the sparkles at the edge on every tab, with the screen's menu inside them", async () => {
  for (const initialUrl of ['/today', '/week']) {
    await renderRouter(routes, { initialUrl });
    const bar = within(screen.getByTestId('title-bar'));
    expect(bar.getByLabelText(HOUSE_DRAFT_COPY.open)).toBeOnTheScreen();
    // The sparkles come last, at the edge, wherever there's a menu too.
    const right = bar.getAllByTestId(/^(more|ask-jonz)$/).map((b) => b.props.testID);
    expect(right.at(-1)).toBe('ask-jonz');
  }
  expect(within(screen.getByTestId('title-bar')).getAllByTestId(/^(more|ask-jonz)$/)).toHaveLength(2);
});

it("holds its buttons in one group at the edge, the screen's own first", async () => {
  await renderRouter(routes, { initialUrl: '/week' });
  const tools = within(screen.getByTestId('bar-tools'));
  expect(tools.getAllByTestId(/^(more|ask-jonz)$/).map((b) => b.props.testID)).toEqual(['more', 'ask-jonz']);
});

it('has no group on a pushed page with nothing to show', async () => {
  await renderRouter(routes, { initialUrl: '/house/wall' });
  expect(screen.queryByTestId('bar-tools')).toBeNull();
});

it('carries a sub line and the screen menu', async () => {
  await renderRouter(routes, { initialUrl: '/house' });
  expect(screen.getByText('2 housemates')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.more }));
  expect(more).toHaveBeenCalledTimes(1);
});

it('goes back where you came from', async () => {
  await renderRouter(routes, { initialUrl: '/house' });
  await fireEvent.press(screen.getByRole('link', { name: 'To the Wall' }));
  expect(screen).toHavePathname('/house/wall');
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.back }));
  expect(screen).toHavePathname('/house');
});

it('goes to its fallback from a page opened cold', async () => {
  await renderRouter(routes, { initialUrl: '/house/wall' });
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.back }));
  expect(screen).toHavePathname('/house');
  expect(screen.getByText('Flat 3')).toBeOnTheScreen();
});

it('names the place back goes to, above the title, a thumb tall', async () => {
  await renderRouter(
    { 'house/stake': () => <TitleBar title="The Stake" back="/house" backLabel={SECTION_LABEL.house} /> },
    { initialUrl: '/house/stake' },
  );
  const bar = within(screen.getByTestId('title-bar'));
  const back = bar.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) });
  expect(back).toHaveStyle({ minHeight: TAP });
  expect(within(back).getByText(SECTION_LABEL.house)).toBeOnTheScreen();
  // The title is still the bar's one heading, on its own line.
  expect(bar.getAllByRole('header')).toHaveLength(1);
  expect(within(back).queryByRole('header')).toBeNull();
  expect(bar.getByRole('header', { name: 'The Stake' })).toBeOnTheScreen();
});

it('puts a leading button before the Title, as chat apps put Your chats', async () => {
  await renderRouter(routes, { initialUrl: '/ask' });
  expect(within(screen.getByTestId('bar-lead')).getByTestId('chats')).toBeOnTheScreen();
  expect(within(screen.getByTestId('bar-tools')).queryByTestId('chats')).toBeNull();
  await fireEvent.press(screen.getByTestId('chats'));
  expect(chats).toHaveBeenCalledTimes(1);
});

it('goes back without leaving the page when given onBack, and shows no Help there', async () => {
  await renderRouter(routes, { initialUrl: '/chats' });
  await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.backTo('Ask Jonz') }));
  expect(toChat).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('bar-tools')).toBeNull();
});

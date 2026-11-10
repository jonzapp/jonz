import { HELP_PAGE, LEGAL_COPY, PRIVACY_POLICY, REPORT_COPY, TERMS, wordsFor } from '@app/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter, screen as routed } from 'expo-router/testing-library';
import { Text, useWindowDimensions } from 'react-native';

import NotFound from '@/app/+not-found';
import { ErrorBoundary } from '@/app/_layout';
import Help from '@/app/help';
import Privacy from '@/app/privacy';
import Terms from '@/app/terms';
import { sendReport } from '@/api/reports';
import { supabase } from '@/api/supabase';
import { useMembership } from '@/hooks/use-membership';

const words = wordsFor('en', 'housemates');

// The root layout's module brings sign-in with it; these pages don't need it.
jest.mock('@/hooks/use-membership', () => ({ MembershipProvider: ({ children }: { children: unknown }) => children, useMembership: jest.fn() }));
jest.mock('@/api/account', () => ({ keepAccount: jest.fn() }));
jest.mock('@/api/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('@/api/reports', () => ({ ...jest.requireActual<typeof import('@/api/reports')>('@/api/reports'), sendReport: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

beforeEach(() => (useWindowDimensions as jest.Mock).mockReturnValue(PHONE));

it.each([
  ['the Privacy Policy', Privacy, PRIVACY_POLICY],
  ['the Terms', Terms, TERMS],
  ['Help', Help, HELP_PAGE],
] as const)('shows %s whole, every section under its heading', async (_, Page, page) => {
  await render(<Page />);
  expect(screen.getByRole('header', { name: page.title })).toBeOnTheScreen();
  expect(screen.getByText(page.updated)).toBeOnTheScreen();
  expect(screen.getByText(page.lead)).toBeOnTheScreen();
  for (const { heading, body, links } of page.sections) {
    expect(screen.getByRole('header', { name: heading })).toBeOnTheScreen();
    for (const paragraph of body) expect(screen.getByText(paragraph)).toBeOnTheScreen();
    for (const link of links ?? []) expect(screen.getByRole('link', { name: link.label })).toHaveProp('href', link.href);
  }
});

it('lists a page to read On this page beside its words on a laptop, and only there', async () => {
  await render(<Privacy />);
  expect(screen.queryByTestId('legal-contents')).toBeNull();

  (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
  await render(<Privacy />);
  const contents = within(screen.getByTestId('legal-pair-start'));
  expect(contents.getByRole('header', { name: LEGAL_COPY.contents })).toBeOnTheScreen();
  expect(contents.getAllByRole('button').map((row) => row.props.accessibilityLabel ?? '')).toHaveLength(PRIVACY_POLICY.sections.length);
  for (const { heading } of PRIVACY_POLICY.sections) {
    expect(contents.getByText(heading)).toBeOnTheScreen();
    expect(within(screen.getByTestId('legal-pair-end')).getByRole('header', { name: heading })).toBeOnTheScreen();
  }
  // A heading jumps to its section without leaving the page.
  await fireEvent.press(contents.getByText(PRIVACY_POLICY.sections[3].heading));
  expect(screen.getByTestId('legal-pair')).toBeOnTheScreen();
});

it('goes back to the front door from privacy opened cold', async () => {
  await renderRouter({ index: () => <Text>Front door</Text>, privacy: Privacy }, { initialUrl: '/privacy' });
  await fireEvent.press(routed.getByRole('button', { name: words('common.shell.back') }));
  expect(routed).toHavePathname('/');
  expect(routed.getByText('Front door')).toBeOnTheScreen();
});

it('turns a link to nowhere back to your Johns', async () => {
  jest.mocked(useMembership).mockReturnValue({ session: { user: { id: 'sam' } } } as ReturnType<typeof useMembership>);
  await render(<NotFound />);
  expect(screen.getByRole('header', { name: words('door.notFound.title') })).toBeOnTheScreen();
  expect(screen.getByText(words('door.notFound.body'))).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: words('door.notFound.back') })).toHaveProp('href', '/');
});

it('turns a link to nowhere back to the front door when signed out', async () => {
  jest.mocked(useMembership).mockReturnValue({ session: null } as ReturnType<typeof useMembership>);
  await render(<NotFound />);
  expect(screen.getByRole('link', { name: words('door.notFound.backToDoor') })).toHaveProp('href', '/');
  expect(screen.queryByRole('link', { name: words('door.notFound.back') })).toBeNull();
});

it('says a screen broke, and tries it again', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
  const retry = jest.fn(async () => {});
  await render(<ErrorBoundary error={new Error('boom')} retry={retry} />);
  expect(screen.getByRole('header', { name: words('door.error.title') })).toBeOnTheScreen();
  expect(screen.getByText(words('door.error.body'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: words('door.error.retry') }));
  expect(retry).toHaveBeenCalled();
});

it('lets someone signed in tell us what happened when a screen broke, with what broke in the details', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'ava' } } }, error: null } as never);
  jest.mocked(sendReport).mockResolvedValue('r1');
  await render(<ErrorBoundary error={new Error('Cannot read the week')} retry={jest.fn(async () => {})} />);
  await fireEvent.press(await screen.findByTestId('crash-report'));
  const form = await screen.findByTestId('report-form');
  expect(within(form).getByTestId('report-send-details')).toHaveTextContent(/Cannot read the week/);
  await fireEvent.changeText(within(form).getByLabelText(REPORT_COPY.words.problem), 'I opened the Week and it went blank.');
  await fireEvent.press(within(form).getByTestId('report-send'));
  await waitFor(() =>
    expect(sendReport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'problem', details: expect.objectContaining({ error: 'Cannot read the week' }) })),
  );
  expect(await screen.findByTestId('crash-report-sent')).toHaveTextContent(words('door.error.told'));
});

it('gives the support address on a broken screen when signed out', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
  await render(<ErrorBoundary error={new Error('boom')} retry={jest.fn(async () => {})} />);
  expect(await screen.findByText(words('door.error.orEmail'))).toBeOnTheScreen();
  expect(screen.queryByTestId('crash-report')).toBeNull();
});

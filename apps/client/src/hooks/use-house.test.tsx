import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { supabase } from '@/api/supabase';
import { snapshot } from '@/testing/house';
import { testQueryClient } from '@/testing/query';

import { houseKey, useCatchUp, useHouse, useLiveHouse } from './use-house';

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
// Outside a navigator a screen is always in focus.
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('@/api/supabase', () => {
  const mockChannel = { on: jest.fn(), subscribe: jest.fn() };
  mockChannel.on.mockReturnValue(mockChannel);
  mockChannel.subscribe.mockReturnValue(mockChannel);
  const client = {
    auth: { getSession: jest.fn() },
    realtime: { setAuth: jest.fn() },
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  };
  // Sign-in on Supabase's own address: live updates ride the same client.
  return {
    supabase: client,
    live: client,
    __channel: mockChannel,
  };
});

const channel = (jest.requireMock('@/api/supabase') as { __channel: { on: jest.Mock; subscribe: jest.Mock } }).__channel;
const sb = supabase as unknown as {
  auth: { getSession: jest.Mock };
  realtime: { setAuth: jest.Mock };
  channel: jest.Mock;
  removeChannel: jest.Mock;
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  client = testQueryClient();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  sb.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });
});

afterEach(() => client.clear());

describe('useHouse', () => {
  it('has no view until the first read lands', async () => {
    let land: (value: unknown) => void = () => undefined;
    (loadHouse as jest.Mock).mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { result } = await renderHook(() => useHouse('h1', 'priya'), { wrapper });
    expect(result.current.view).toBeNull();
    expect(loadHouse).toHaveBeenCalledWith('h1', expect.any(Date));
    land(snapshot());
    await waitFor(() => expect(result.current.view).not.toBeNull());
  });

  it("builds this week's board, Today's view of it, and who you are", async () => {
    const { result } = await renderHook(() => useHouse('h1', 'priya'), { wrapper });
    await waitFor(() => expect(result.current.view).not.toBeNull());
    const view = result.current.view!;
    expect(view.board.items).toHaveLength(4);
    expect(view.today.mine.map((i) => i.name)).toEqual(['Bins out', 'Hoover the stairs', 'Wipe the hob']);
    expect(view.today.left).toBe(2);
    expect(view.me).toMatchObject({ userId: 'priya', role: 'admin', streak: 3 });
  });

  it("knows a house whose week hasn't been dealt", async () => {
    (loadHouse as jest.Mock).mockResolvedValue(snapshot({ week: null, assignments: [] }));
    const { result } = await renderHook(() => useHouse('h1', 'priya'), { wrapper });
    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(result.current.view!.board).toMatchObject({ week: null, items: [], notStarted: false });
  });
});

describe('useLiveHouse', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function listen() {
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    const hook = await renderHook(() => useLiveHouse('h1'), { wrapper });
    await act(async () => undefined);
    const onChange = channel.on.mock.calls[0][2] as () => void;
    return { invalidate, onChange, ...hook };
  }

  it("listens to the house's ticks, disputes and Wall with the user's token", async () => {
    await listen();
    expect(sb.realtime.setAuth).toHaveBeenCalledWith('token-1');
    expect(sb.channel).toHaveBeenCalledWith('house:h1');
    expect(channel.on.mock.calls.map(([, opts]) => opts)).toEqual(
      ['events', 'assignments', 'disputes'].map((table) => ({
        event: '*',
        schema: 'public',
        table,
        filter: 'house_id=eq.h1',
      })),
    );
    expect(channel.subscribe).toHaveBeenCalled();
  });

  it('folds a burst of changes into one read of the house', async () => {
    const { invalidate, onChange } = await listen();
    await act(async () => {
      onChange();
      onChange();
      jest.advanceTimersByTime(300);
      onChange();
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(400));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: houseKey('h1') });
  });

  it('stops listening when the screen goes, and drops a read still waiting', async () => {
    const { invalidate, onChange, unmount } = await listen();
    await act(async () => onChange());
    await unmount();
    expect(sb.removeChannel).toHaveBeenCalledWith(channel);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("doesn't open a channel when the screen went before the session was read", async () => {
    let answer: (value: unknown) => void = () => undefined;
    sb.auth.getSession.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { unmount } = await renderHook(() => useLiveHouse('h1'), { wrapper });
    await unmount();
    await act(async () => answer({ data: { session: null } }));
    expect(sb.channel).not.toHaveBeenCalled();
  });
});

describe('useCatchUp', () => {
  it('catches the house up as the screen comes into view, and leaves the read alone when nothing changed', async () => {
    (catchUp as jest.Mock).mockResolvedValue(false);
    const { result } = await renderHook(() => ({ house: useHouse('h1', 'priya'), freshen: useCatchUp('h1') }), { wrapper });
    await waitFor(() => expect(result.current.house.view).not.toBeNull());
    expect(catchUp).toHaveBeenCalledWith('h1');
    expect(loadHouse).toHaveBeenCalledTimes(1);
    await expect(result.current.freshen()).resolves.toBe(false);
  });

  it('starts a read already on its way again when the server had something to do', async () => {
    let first: (value: unknown) => void = () => undefined;
    (loadHouse as jest.Mock).mockReturnValueOnce(new Promise((resolve) => (first = resolve)));
    (catchUp as jest.Mock).mockResolvedValue(true);
    const { result } = await renderHook(() => ({ house: useHouse('h1', 'priya'), freshen: useCatchUp('h1') }), { wrapper });
    await waitFor(() => expect(loadHouse).toHaveBeenCalledTimes(2));
    first(snapshot({ week: null }));
    await waitFor(() => expect(result.current.house.view).not.toBeNull());
    // The read from after the catch-up is the one on screen.
    expect(result.current.house.view!.board.week).not.toBeNull();
    await expect(result.current.freshen()).resolves.toBe(true);
  });

  it("only warns when it can't reach the server", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (catchUp as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useCatchUp('h1'), { wrapper });
    await waitFor(() => expect(warn).toHaveBeenCalledWith('Catching up failed', expect.any(Error)));
    await expect(result.current()).resolves.toBe(false);
    warn.mockRestore();
  });
});

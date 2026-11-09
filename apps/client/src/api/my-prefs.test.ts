import { saveMyPrefs } from './my-prefs';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(null);
});

it('saves your days, best time and Johns on /v1', async () => {
  await saveMyPrefs('h1', { days: [3, 6], bestTime: 'morning', rather: { j1: 1, j2: -1 } });
  expect(call).toHaveBeenCalledWith('save_prefs', { houseId: 'h1', days: [3, 6], bestTime: 'morning', rather: { j1: 1, j2: -1 } });
  await saveMyPrefs('h1', { days: [], bestTime: null, rather: {} });
  expect(call).toHaveBeenLastCalledWith('save_prefs', { houseId: 'h1', days: [], bestTime: null, rather: {} });
});

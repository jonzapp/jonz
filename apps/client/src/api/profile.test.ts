import { renameMe } from './profile';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(null);
});

describe('renameMe', () => {
  it('writes your name, tidied, on /v1', async () => {
    await renameMe('ava', '  Ava B  ');
    expect(call).toHaveBeenCalledWith('set_my_name', { name: 'Ava B' });
  });

  it('refuses an empty or overlong name before writing', async () => {
    await expect(renameMe('ava', '   ')).rejects.toThrow('Names are 1 to 60 characters.');
    await expect(renameMe('ava', 'x'.repeat(61))).rejects.toThrow('Names are 1 to 60 characters.');
    expect(call).not.toHaveBeenCalled();
  });

  it('passes on the refusal', async () => {
    call.mockRejectedValue(new Error('You can’t do that.'));
    await expect(renameMe('ava', 'Ava')).rejects.toThrow('You can’t do that.');
  });
});

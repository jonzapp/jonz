import { raiseFlag } from './flags';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const JOHN = '8f14e45f-ceea-467f-a8f5-2fbf7c2d9b1a';
const FLAG = 'c4ca4238-a0b9-4382-8dcc-509a6f75849b';

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue({ ok: true, assignmentId: FLAG });
});

describe('raiseFlag', () => {
  it("flags the John on /v1 and answers the flag's id", async () => {
    await expect(raiseFlag(JOHN)).resolves.toBe(FLAG);
    expect(call).toHaveBeenCalledWith('raise_flag', { johnId: JOHN });
  });

  it("passes on the API's refusal", async () => {
    call.mockRejectedValue(new Error('Everyone who shares that John is away today.'));
    await expect(raiseFlag(JOHN)).rejects.toThrow('Everyone who shares that John is away today.');
  });
});

import { answerDispute, answerTick, castVote, raiseDispute } from './disputes';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const JOHN = '8f14e45f-ceea-467f-a8f5-2fbf7c2d9b1a';
const DISPUTE = 'c4ca4238-a0b9-4382-8dcc-509a6f75849b';

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue({ ok: true });
});

describe('raiseDispute', () => {
  it('sends the John and the tidied reason', async () => {
    await raiseDispute(JOHN, '  Still full  ');
    expect(call).toHaveBeenCalledWith('raise_dispute', { assignmentId: JOHN, reason: 'Still full' });
  });

  it("says what's wrong before asking the API", async () => {
    await expect(raiseDispute(JOHN, '   ')).rejects.toThrow('Say what’s wrong with it.');
    await expect(raiseDispute(JOHN, 'x'.repeat(281))).rejects.toThrow('Keep it under 280 characters.');
    expect(call).not.toHaveBeenCalled();
  });

  it("passes on the API's refusal", async () => {
    call.mockRejectedValue(new Error('Someone’s already disputing that tick.'));
    await expect(raiseDispute(JOHN, 'Still full')).rejects.toThrow('Someone’s already disputing that tick.');
  });
});

describe('castVote and answerTick', () => {
  it('vote on the dispute, and answer the tick', async () => {
    await castVote(DISPUTE, true);
    expect(call).toHaveBeenCalledWith('cast_vote', { disputeId: DISPUTE, uphold: true });
    await answerTick(JOHN, false);
    expect(call).toHaveBeenLastCalledWith('answer_tick', { assignmentId: JOHN, ok: false });
  });
});

describe('answerDispute', () => {
  it('answers with the uploaded photo, and says whether that settled it', async () => {
    call.mockResolvedValue(true);
    await expect(answerDispute(DISPUTE, 'house/john/x.jpg')).resolves.toBe(true);
    expect(call).toHaveBeenCalledWith('answer_dispute', { disputeId: DISPUTE, photoPath: 'house/john/x.jpg' });
  });
});

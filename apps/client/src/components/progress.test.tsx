import { BIN_NIGHT, wholePercent, wordsFor } from '@app/core';
import { render, screen } from '@testing-library/react-native';

import { UsageDetail } from '@/components/chat/ask-usage';
import { Progress } from '@/components/progress';

const words = wordsFor('en', 'housemates');
const light = BIN_NIGHT.light;

describe('Progress', () => {
  it('is a bar named for what it measures, with how much over it, filled in ink while going', async () => {
    await render(<Progress value={1} max={3} label="Setting up" amount="1 of 3 steps done" testID="setup" />);
    const bar = screen.getByRole('progressbar', { name: 'Setting up' });
    expect(bar).toHaveProp('aria-valuenow', 33);
    expect(bar).toHaveStyle({ backgroundColor: light.secondary });
    expect(screen.getByText('1 of 3 steps done')).toBeOnTheScreen();
    expect(screen.getByTestId('setup-fill')).toHaveStyle({ width: '33%', backgroundColor: light.foreground });
  });

  it('turns hazard when a limit is nearly used, and green once complete, never amber', async () => {
    await render(
      <>
        <Progress value={0.92} max={1} spoken="The house" warn testID="nearly" />
        <Progress value={3} max={3} spoken="Set up" testID="done" />
      </>,
    );
    expect(screen.getByTestId('nearly-fill')).toHaveStyle({ backgroundColor: light.hazard });
    expect(screen.getByTestId('done-fill')).toHaveStyle({ width: '100%', backgroundColor: light.good });
    for (const id of ['nearly-fill', 'done-fill']) expect(screen.getByTestId(id)).not.toHaveStyle({ backgroundColor: light.hivis });
  });

  it("never runs past its ends", async () => {
    await render(<Progress value={5} max={3} spoken="Over" testID="over" />);
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveProp('aria-valuenow', 100);
  });
});

describe('Ask Jonz usage', () => {
  const usage = {
    cap: 100,
    room: 8,
    left: 0.08,
    house: false,
    limit: 'mine' as const,
    resetsAt: '2026-11-16T00:00:00.000Z',
    pass: false,
    people: 2,
    houseUsed: 0.7,
    mineUsed: 0.92,
    usedBy: [{ userId: '00000000-0000-4000-8000-000000000001', used: 0.46 }],
  };

  it("draws each share of the week as the one Progress bar: ink for the house's, hazard for a half nearly used", async () => {
    await render(<UsageDetail usage={usage} zone="Europe/London" me="00000000-0000-4000-8000-000000000001" nameOf={() => 'Sam'} />);
    expect(screen.getByRole('progressbar', { name: words('ask.usage.house') })).toHaveProp('aria-valuenow', 70);
    expect(screen.getByText(words('ask.usage.used', { used: wholePercent(0.92) }))).toBeOnTheScreen();
    expect(screen.getByTestId('usage-house-progress-fill')).toHaveStyle({ backgroundColor: light.foreground });
    expect(screen.getByTestId('usage-mine-progress-fill')).toHaveStyle({ backgroundColor: light.hazard });
  });
});


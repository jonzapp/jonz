import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { BarChart } from '@/components/chart';

const BARS = [
  { key: 'you', name: 'You', value: 2, shown: '+2' },
  { key: 'sam', name: 'Sam', value: -4, shown: '−4' },
  { key: 'priya', name: 'Priya', value: 0, shown: 'level' },
];


describe('BarChart', () => {
  it('names its halves, and draws each bar on its side as its share of the largest', async () => {
    await render(<BarChart bars={BARS} below="Behind" above="Ahead" testID="chart" />);
    const chart = screen.getByTestId('chart');
    expect(within(chart).getByText('Behind')).toBeOnTheScreen();
    expect(within(chart).getByText('Ahead')).toBeOnTheScreen();
    const bars = screen.getAllByTestId('chart-bar');
    expect(bars).toHaveLength(3);
    // You are ahead by half the largest; Sam behind by all of it; Priya level, with no bar either side.
    expect(within(bars[0]).getByTestId('chart-bar-above')).toBeOnTheScreen();
    expect(within(bars[0]).queryByTestId('chart-bar-below')).toBeNull();
    expect(within(bars[1]).getByTestId('chart-bar-below')).toBeOnTheScreen();
    expect(within(bars[2]).queryByTestId('chart-bar-above')).toBeNull();
    expect(within(bars[2]).queryByTestId('chart-bar-below')).toBeNull();
    expect(StyleSheet.flatten(within(bars[0]).getByTestId('chart-bar-above').props.style).width).toBe('50%');
    expect(StyleSheet.flatten(within(bars[1]).getByTestId('chart-bar-below').props.style).width).toBe('100%');
  });

  it('is heard as one picture naming each line and its number, in order', async () => {
    await render(<BarChart bars={BARS} below="Behind" above="Ahead" testID="chart" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('You, +2; Sam, −4; Priya, level');
  });

  it('draws no bars when everyone is level', async () => {
    await render(<BarChart bars={[{ key: 'you', name: 'You', value: 0, shown: 'level' }]} below="Behind" above="Ahead" testID="chart" />);
    expect(screen.queryByTestId('chart-bar-above')).toBeNull();
    expect(screen.queryByTestId('chart-bar-below')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { NARROW, SPACE, TAP } from '@/theme';

import { Segmented } from './segmented';

// focus.test.tsx covers the switch itself; this is how it fits a small phone.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));

const look = (
  <Segmented
    label="Look"
    options={[
      { value: 'light', label: 'Day' },
      { value: 'dark', label: 'Night' },
      { value: 'system', label: 'Auto' },
    ]}
    value="system"
    onChange={jest.fn()}
  />
);

it('pads its words on a phone', async () => {
  await render(look);
  expect(screen.getByRole('radio', { name: 'Night' })).toHaveStyle({ paddingHorizontal: SPACE.md });
});

it('pads them less on a small phone, so the row beside it keeps its name, still a thumb wide and tall', async () => {
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: NARROW - 40, height: 640, scale: 2, fontScale: 1 });
  await render(look);
  for (const name of ['Day', 'Night', 'Auto']) {
    expect(screen.getByRole('radio', { name })).toHaveStyle({ paddingHorizontal: SPACE.xs, minWidth: TAP, minHeight: TAP });
  }
});

it('wraps in equal parts, so many to a row, where one row would cut its words short', async () => {
  await render(
    <Segmented
      label="Ends"
      options={['When I end it', 'In 2 hours', 'Tomorrow', 'On a date'].map((label) => ({ value: label, label }))}
      value="Tomorrow"
      onChange={jest.fn()}
      perRow={2}
      testID="ends"
    />,
  );
  expect(screen.getByTestId('ends')).toHaveStyle({ flexWrap: 'wrap', alignSelf: 'stretch' });
  for (const part of screen.getAllByRole('radio')) expect(part).toHaveStyle({ flexBasis: '50%', flexGrow: 0, minHeight: TAP });
});

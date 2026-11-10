import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

import { ListFoot, nearEnd, type ListMore } from './list-foot';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 2, fontScale: 1 };
const more = (over: Partial<ListMore> = {}): ListMore => ({ has: true, busy: false, failed: false, load: jest.fn(), ...over });

beforeEach(() => {
  jest.mocked(useWindowDimensions).mockReturnValue(PHONE);
});

describe('the foot of a long list', () => {
  it('says how far back it goes, with Show more for a keyboard or a short page', async () => {
    const m = more();
    await render(<ListFoot more={m} shown="Showing back to Tue 27 Oct" />);
    expect(screen.getByText('Showing back to Tue 27 Oct')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('list-foot-more'));
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it('says it is reading while it reads, with nothing to press', async () => {
    await render(<ListFoot more={more({ busy: true })} shown="Showing back to Tue 27 Oct" />);
    expect(screen.getByText(words('common.list.loading'))).toBeOnTheScreen();
    expect(screen.queryByTestId('list-foot-more')).toBeNull();
  });

  it('says that’s everything at the end', async () => {
    await render(<ListFoot more={more({ has: false })} shown="Showing back to Thu 3 Sep" />);
    expect(screen.getByTestId('list-foot')).toHaveTextContent(words('common.list.everything'));
    expect(screen.queryByTestId('list-foot-more')).toBeNull();
  });

  it('says a read failed, with Try again across the width', async () => {
    const m = more({ failed: true });
    await render(<ListFoot more={m} />);
    expect(screen.getByRole('alert')).toHaveTextContent(words('common.list.failed'));
    expect(screen.getByTestId('list-foot')).toHaveStyle({ alignItems: 'stretch' });
    await fireEvent.press(screen.getByTestId('list-foot-retry'));
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it('stays pinned along the bottom of the window on a laptop, and sits under the list on a phone', async () => {
    const { rerender } = await render(<ListFoot more={more()} shown="Showing back to Tue 27 Oct" />);
    expect(screen.getByTestId('list-foot')).not.toHaveStyle({ bottom: 0 });
    const os = Platform.OS;
    Platform.OS = 'web';
    jest.mocked(useWindowDimensions).mockReturnValue(LAPTOP);
    await rerender(<ListFoot more={more()} shown="Showing back to Tue 27 Oct" />);
    // React Native's types stop at absolute; the web's sticky is what pins it.
    expect(screen.getByTestId('list-foot')).toHaveStyle({ position: 'sticky', bottom: 0, flexDirection: 'row' } as unknown as ViewStyle);
    Platform.OS = os;
  });
});

describe('reading more near the end', () => {
  it('reads the next page only when there is one, it isn’t already reading, and the last read didn’t fail', () => {
    const go = (over: Partial<ListMore>) => {
      const m = more(over);
      nearEnd(m)();
      return m.load;
    };
    expect(go({})).toHaveBeenCalledTimes(1);
    expect(go({ has: false })).not.toHaveBeenCalled();
    expect(go({ busy: true })).not.toHaveBeenCalled();
    expect(go({ failed: true })).not.toHaveBeenCalled();
  });
});

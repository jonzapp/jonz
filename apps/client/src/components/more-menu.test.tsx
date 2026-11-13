import { fireEvent, render, screen } from '@testing-library/react-native';
import { PencilIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { SPACE, TAP, WIDE } from '@/theme';

import { ActionMenu } from './action-menu';
import type { MenuPlace } from './drop-menu';
import { MoreButton } from './title-bar';

// Every host view's measureInWindow, as react-native's jest setup mocks it: one jest.fn they share.
const { measureInWindow } = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));

/** Week's "•••" and its menu, held as the Week screen holds them. */
function More({ order }: { order: string[] }) {
  const [menu, setMenu] = useState<{ place: MenuPlace | null } | null>(null);
  return (
    <>
      <MoreButton onPress={(place) => setMenu({ place })} />
      <ActionMenu
        visible={menu !== null}
        place={menu?.place ?? null}
        onClose={() => {
          order.push('closed');
          setMenu(null);
        }}
        actions={[{ label: 'Rename the house', icon: PencilIcon, onPress: () => order.push('rename') }]}
        testID="menu"
      />
    </>
  );
}

it('on a phone, opens as a sheet', async () => {
  await render(<More order={[]} />);
  await fireEvent.press(screen.getByTestId('more'));
  expect(screen.getByRole('button', { name: 'Rename the house' })).toBeOnTheScreen();
  expect(screen.queryByTestId('menu-menu')).toBeNull();
});

describe('beside the page', () => {
  beforeEach(() => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: WIDE + 416, height: 900, scale: 1, fontScale: 1 });
    // The "•••" sits at 1300–1348 across, 20–68 down.
    measureInWindow.mockImplementation((place: (x: number, y: number, w: number, h: number) => void) => place(1300, 20, TAP, TAP));
  });
  afterEach(() => measureInWindow.mockReset());

  it('drops from the "•••", their right edges together', async () => {
    await render(<More order={[]} />);
    await fireEvent.press(screen.getByTestId('more'));
    expect(screen.getByTestId('menu-menu')).toHaveStyle({ top: 20 + TAP + SPACE.xs, right: WIDE + 416 - 1300 - TAP });
  });

  it('does what was chosen as it goes, and goes with a tap anywhere else', async () => {
    const order: string[] = [];
    await render(<More order={order} />);
    await fireEvent.press(screen.getByTestId('more'));
    await fireEvent.press(screen.getByRole('button', { name: 'Rename the house' }));
    expect(order).toEqual(['closed', 'rename']);
    expect(screen.queryByTestId('menu-menu')).toBeNull();
    await fireEvent.press(screen.getByTestId('more'));
    await fireEvent(screen.getByTestId('menu-away', { includeHiddenElements: true }), 'responderRelease');
    expect(screen.queryByTestId('menu-menu')).toBeNull();
    expect(order).toEqual(['closed', 'rename', 'closed']);
  });
});

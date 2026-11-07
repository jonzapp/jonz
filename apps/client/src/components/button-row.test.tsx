import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { FORM_MAX } from '@/theme';

import { Button } from './button';
import { ButtonRow } from './button-row';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
}));

const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const none = () => {};

/** Tells the row how wide its column is, as the layout would. */
async function laidOutAt(width: number) {
  await act(async () => {
    fireEvent(screen.getByTestId('row'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } } });
  });
}

afterEach(() => (useWindowDimensions as jest.Mock).mockReturnValue(PHONE));

describe('a button on its own', () => {
  it('fills its column on a phone (Deal week 1 on Week)', async () => {
    await render(
      <ButtonRow testID="row">
        <Button label="Deal week 1" onPress={none} />
      </ButtonRow>,
    );
    await laidOutAt(358);
    expect(screen.getByRole('button', { name: 'Deal week 1' })).toHaveStyle({ alignSelf: 'stretch' });
    expect(screen.getByTestId('row')).toHaveStyle({ alignItems: 'stretch' });
  });

  it('keeps its own width at the leading edge of a wide column on a laptop', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await render(
      <ButtonRow testID="row">
        <Button label="Deal week 1" onPress={none} />
      </ButtonRow>,
    );
    await laidOutAt(1000);
    expect(screen.getByRole('button', { name: 'Deal week 1' })).not.toHaveStyle({ alignSelf: 'stretch' });
    expect(screen.getByTestId('row')).toHaveStyle({ alignItems: 'flex-start' });
  });

  it('fills a form, a sheet or a side panel on a laptop (up to FORM_MAX)', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await render(
      <ButtonRow testID="row">
        <Button label="Send report" onPress={none} />
      </ButtonRow>,
    );
    await laidOutAt(FORM_MAX);
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveStyle({ alignSelf: 'stretch' });
  });
});

describe('buttons together', () => {
  it('share the line equally when they fit', async () => {
    await render(
      <ButtonRow testID="row">
        <Button label="Save" onPress={none} />
        <Button variant="outline" label="Cancel" onPress={none} />
      </ButtonRow>,
    );
    await laidOutAt(358);
    for (const name of ['Save', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ flexGrow: 1, flexBasis: 0 });
    }
    expect(screen.getByTestId('row')).toHaveStyle({ flexDirection: 'row' });
  });

  it('stack at full width when asked to, on a laptop too', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await render(
      <ButtonRow stacked testID="row">
        <Button label="Delete" onPress={none} />
        <Button variant="outline" label="Cancel" onPress={none} />
      </ButtonRow>,
    );
    await laidOutAt(1000);
    for (const name of ['Delete', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ alignSelf: 'stretch' });
    }
  });
});

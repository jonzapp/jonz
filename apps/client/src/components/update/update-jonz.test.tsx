import { SHARE_SITE, wordsFor } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { UpdateJonz } from './update-jonz';

const words = wordsFor('en', 'housemates');

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

describe('UpdateJonz', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  it('says the build is too old and sends you to the store, with the web meanwhile', async () => {
    await render(<UpdateJonz store="https://play.google.com/store/apps/details?id=dev.glyn.jonz" />);
    expect(screen.getByText(words('common.update.title'))).toBeTruthy();
    expect(screen.getByText(words('common.update.body'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('update-store'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=dev.glyn.jonz');
    await fireEvent.press(screen.getByTestId('update-web'));
    expect(Linking.openURL).toHaveBeenCalledWith(SHARE_SITE);
  });

  it('offers only the web where there is no store to send you to', async () => {
    await render(<UpdateJonz store={null} />);
    expect(screen.queryByTestId('update-store')).toBeNull();
    expect(screen.getByTestId('update-web')).toBeTruthy();
  });
});

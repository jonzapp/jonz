import { fireEvent, render, screen } from '@testing-library/react-native';

import { Photo } from './photo';

describe('a photo that holds its space', () => {
  it('waits in the outline until the photo has loaded, then shows it', async () => {
    await render(<Photo uri="https://example.test/receipt.jpg" label="Receipt for Bins" style={{ width: 200, aspectRatio: 4 / 3 }} testID="photo" />);
    const box = screen.getByTestId('photo');
    expect(box).toBeBusy();
    expect(screen.getByLabelText('Receipt for Bins')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('photo-image', { includeHiddenElements: true }), 'load');
    expect(screen.getByTestId('photo')).not.toBeBusy();
  });

  it('waits for a link still on its way, with no broken image', async () => {
    await render(<Photo uri={null} label="Receipt for Bins" testID="photo" />);
    expect(screen.getByTestId('photo')).toBeBusy();
    expect(screen.queryByTestId('photo-image', { includeHiddenElements: true })).toBeNull();
  });

  it('stops waiting when the photo cannot load', async () => {
    await render(<Photo uri="https://example.test/gone.jpg" label="Receipt for Bins" testID="photo" />);
    await fireEvent(screen.getByTestId('photo-image', { includeHiddenElements: true }), 'error');
    expect(screen.getByTestId('photo')).not.toBeBusy();
  });
});

import { BIN_NIGHT } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Table, TableHead, TableRow, type TableColumn } from '@/components/table';

const light = BIN_NIGHT.light;
const COLUMNS: readonly TableColumn[] = [
  { key: 'who', label: 'Person', flex: 2 },
  { key: 'done', label: 'Done', width: 64, end: true },
];
// The column names are only for the eye on a table whose rows are heard whole.
const HIDDEN = { includeHiddenElements: true };

describe('Table', () => {
  it('heads its rows with the column names on its own card colour, hidden from a screen reader', async () => {
    const open = jest.fn();
    await render(
      <Table columns={COLUMNS} testID="shares">
        <TableRow columns={COLUMNS} cells={{ who: 'Sam', done: '19' }} onPress={open} accessibilityLabel="Sam, 19 done" testID="sam" />
      </Table>,
    );
    const head = screen.getByTestId('shares-head', HIDDEN);
    expect(head).toHaveTextContent(/Person.*Done/);
    expect(head).toHaveStyle({ backgroundColor: light.card });
    expect(screen.queryByText('Person')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Sam, 19 done' }));
    expect(open).toHaveBeenCalled();
  });

  it('says its names where the rows are heard cell by cell, as a reply’s are, with nothing to press', async () => {
    await render(
      <Table columns={COLUMNS} spoken testID="reply">
        <TableRow columns={COLUMNS} cells={{ who: <Text>Priya</Text>, done: '21' }} />
      </Table>,
    );
    expect(screen.getByText('Person')).toBeOnTheScreen();
    expect(screen.getByText('Priya')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws the line under its names itself when they stand apart, pinned over rows that scroll', async () => {
    await render(<TableHead columns={COLUMNS} testID="pinned" />);
    expect(screen.getByTestId('pinned', HIDDEN)).toHaveStyle({ borderTopLeftRadius: 10, backgroundColor: light.card });
    expect(screen.getByTestId('pinned-line', HIDDEN)).toBeOnTheScreen();
  });
});

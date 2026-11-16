import { atLocalTime, dayName, localDay, localDayTime, noticeLaterStart, wordsFor, type Notice } from '@app/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { NoticeEditor } from '@/components/admin/notice-editor';
import { NOW } from '@/testing/clock';

const words = wordsFor('en', 'housemates');
const shownDay = (day: string) => localDay(day, 'weekdayDayMonthYear', words);

/** A day a few days on from the pretend now, on this machine's clock. */
const dayOn = (days: number) => localDayTime(new Date(NOW.getTime() + days * 86_400_000)).day;

const LATER: Notice = {
  id: 'n2',
  kind: 'news',
  title: 'Jonz is on iPhone and Android',
  body: '',
  linkLabel: null,
  linkUrl: null,
  // Saved at a time between the half hours, as a typed one could be.
  startsAt: atLocalTime(dayOn(3), '16:05')!.toISOString(),
  endsAt: null,
} as Notice;

async function newNotice() {
  const onSave = jest.fn();
  await render(<NoticeEditor notice={null} waiting={null} onSave={onSave} />);
  await fireEvent.changeText(screen.getByTestId('notice-title'), 'Jonz is slow right now');
  return onSave;
}

describe('NoticeEditor', () => {
  it('picks a later start with a date picker and a time, never a typed date', async () => {
    const onSave = await newNotice();
    expect(screen.queryByTestId('notice-starts-day')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: words('admin.shell.startsLater') }));
    // A day on, at the next half hour, with nothing to type.
    const later = localDayTime(noticeLaterStart(NOW));
    expect(screen.getByTestId('notice-starts-day')).toHaveTextContent(shownDay(later.day));
    expect(screen.getByTestId('notice-starts-time')).toHaveTextContent(later.time);
    expect(screen.getByText(words('admin.shell.startsOn'))).toBeOnTheScreen();
    expect(screen.queryByDisplayValue(/\d{4}-\d{2}-\d{2}/)).toBeNull();

    await fireEvent.press(screen.getByTestId('notice-starts-time'));
    const times = screen.getByTestId('notice-starts-time-choices');
    expect(within(times).getAllByRole('radio')).toHaveLength(48);
    await fireEvent.press(screen.getByTestId('notice-starts-time-14:30'));
    expect(screen.getByTestId('notice-starts-time')).toHaveTextContent('14:30');

    await fireEvent.press(screen.getByTestId('notice-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startsAt: atLocalTime(later.day, '14:30'), endsAt: null }));
  });

  it('ends on a day and time a week after it starts, and says so when the end is before the start', async () => {
    const onSave = await newNotice();
    await fireEvent.press(screen.getByRole('radio', { name: words('admin.shell.startsLater') }));
    await fireEvent.press(screen.getByTestId('notice-starts-time'));
    await fireEvent.press(screen.getByTestId('notice-starts-time-14:30'));
    await fireEvent.press(screen.getByRole('radio', { name: 'On a date' }));
    const start = localDayTime(noticeLaterStart(NOW)).day;
    const week = localDayTime(new Date(atLocalTime(start, '14:30')!.getTime() + 7 * 86_400_000));
    expect(screen.getByTestId('notice-ends-day')).toHaveTextContent(shownDay(week.day));
    expect(screen.getByTestId('notice-ends-time')).toHaveTextContent(week.time);

    // The same day as it starts, half an hour earlier.
    await fireEvent.press(screen.getByTestId('notice-ends-day'));
    await fireEvent.press(screen.getByRole('button', { name: dayName(start, words) }));
    await fireEvent.press(screen.getByTestId('notice-ends-time'));
    await fireEvent.press(screen.getByTestId('notice-ends-time-14:00'));
    await fireEvent.press(screen.getByTestId('notice-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('It has to end after it starts.');

    await fireEvent.press(screen.getByTestId('notice-ends-time'));
    await fireEvent.press(screen.getByTestId('notice-ends-time-18:00'));
    await fireEvent.press(screen.getByTestId('notice-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startsAt: atLocalTime(start, '14:30'), endsAt: atLocalTime(start, '18:00') }));
  });

  it('shows a saved start at its own day and time, kept in the list between the half hours', async () => {
    const onSave = jest.fn();
    await render(<NoticeEditor notice={LATER} waiting={null} onSave={onSave} />);
    expect(screen.getByTestId('notice-starts-day')).toHaveTextContent(shownDay(dayOn(3)));
    expect(screen.getByTestId('notice-starts-time')).toHaveTextContent('16:05');
    await fireEvent.press(screen.getByTestId('notice-starts-time'));
    expect(within(screen.getByTestId('notice-starts-time-choices')).getAllByRole('radio')).toHaveLength(49);
    expect(screen.getByTestId('notice-starts-time-16:05')).toBeChecked();
    await fireEvent.press(screen.getByTestId('notice-starts-time-16:05'));
    await fireEvent.press(screen.getByTestId('notice-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'n2', startsAt: new Date(LATER.startsAt) }));
  });
});

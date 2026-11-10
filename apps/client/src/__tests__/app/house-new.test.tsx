import { BIN_NIGHT, FRONT_DOOR_COPY, MOVING_COPY, NEW_HOUSE_COPY, wordsFor } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { createHouse } from '@/api/house';
import { startHouseFrom } from '@/api/moving';
import NewHouse from '@/app/house/new';

const words = wordsFor('en', 'housemates');

const mockRefresh = jest.fn();
jest.mock('@/api/house', () => ({ createHouse: jest.fn() }));
jest.mock('@/api/moving', () => ({ startHouseFrom: jest.fn() }));
let mockMoving: { fromHouse: string; houseName: string; johns: number } | null = null;
let mockFrom: string | undefined;
let mockKind: string | undefined;
jest.mock('@/hooks/use-moving-on', () => ({ useMovingOn: () => ({ data: mockMoving }) }));
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useLocalSearchParams: () => ({ from: mockFrom, kind: mockKind }) }));
jest.mock('@/hooks/use-membership', () => ({ useMembership: () => ({ refresh: mockRefresh }) }));
jest.mock('@/locale', () => ({ deviceTimeZone: () => 'America/St_Johns', deviceCurrency: () => 'CAD' }));

const create = createHouse as jest.Mock;
/** The defaults line as it's drawn: its parts between middle dots, as every Meta line's are. */
const line = (...parts: string[]) => parts.join(', ');

beforeEach(() => {
  jest.clearAllMocks();
  mockMoving = null;
  mockFrom = undefined;
  mockKind = undefined;
});

const kindName = (kind: 'family' | 'housemates') => `${words(`house.family.kinds.${kind}` as const)}, ${words(`house.family.kindBody.${kind}` as const)}`;

it('asks for one thing, the name, with the defaults in a line', async () => {
  await render(<NewHouse />);
  expect(screen.getByRole('header', { name: NEW_HOUSE_COPY.heading })).toBeOnTheScreen();
  expect(screen.getByLabelText(FRONT_DOOR_COPY.name)).toBeOnTheScreen();
  // The phone's currency and time zone, and Monday: two lines where one can't hold them, so the zone is never cut off.
  const defaults = screen.getByTestId('house-defaults');
  expect(defaults).toHaveTextContent(line('CAD 20 a month each', 'weeks start Monday', 'America/St Johns'));
  expect(defaults).toHaveProp('numberOfLines', 2);
  expect(screen.getByTestId('change-defaults')).toHaveTextContent(FRONT_DOOR_COPY.change, { exact: false });
  // Who lives here: Housemates or Family, housemates picked.
  expect(screen.getByText(words('house.family.whoLivesHere'))).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: kindName('housemates') })).toBeChecked();
  const submit = screen.getByRole('button', { name: FRONT_DOOR_COPY.submit });
  expect(submit).toBeDisabled();
  expect(submit).toHaveStyle({ backgroundColor: BIN_NIGHT.light.hivis });
});

it('starts the house with the defaults, then reads the house again', async () => {
  create.mockResolvedValue('h1');
  await render(<NewHouse />);
  await fireEvent.changeText(screen.getByLabelText(FRONT_DOOR_COPY.name), 'Flat 3');
  await fireEvent.press(screen.getByRole('button', { name: FRONT_DOOR_COPY.submit }));
  expect(create).toHaveBeenCalledWith({ name: 'Flat 3', timezone: 'America/St_Johns', currency: 'CAD', weekStarts: 1, kind: 'housemates' });
  expect(mockRefresh).toHaveBeenCalled();
});

it('opens the currency and the first day under Change, and the line follows them', async () => {
  create.mockResolvedValue('h1');
  await render(<NewHouse />);
  const change = screen.getByTestId('change-defaults');
  expect(change).toBeCollapsed();
  expect(change).toHaveAccessibleName(`${FRONT_DOOR_COPY.change}: CAD 20 a month each, weeks start Monday, America/St Johns`);
  await fireEvent.press(change);
  // The same control, now open, says Done.
  expect(screen.getByTestId('change-defaults')).toBeExpanded();
  expect(screen.getByTestId('change-defaults')).toHaveTextContent(FRONT_DOOR_COPY.done, { exact: false });
  expect(screen.getByLabelText(NEW_HOUSE_COPY.currency)).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'CAD' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Monday' })).toBeChecked();
  // Seven days share the sign's width, so they fit across a phone.
  for (const day of ['Monday', 'Wednesday', 'Sunday']) expect(screen.getByRole('radio', { name: day })).toHaveStyle({ flex: 1 });
  expect(screen.getByText(FRONT_DOOR_COPY.zoneNote('America/St Johns'))).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('radio', { name: 'EUR' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Sunday' }));
  expect(screen.getByRole('radio', { name: 'Sunday' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Monday' })).not.toBeChecked();
  expect(screen.getByTestId('house-defaults')).toHaveTextContent(
    line('EUR 20 a month each', 'weeks start Sunday', 'America/St Johns'),
  );

  // Done folds them away again, keeping what was chosen.
  await fireEvent.press(screen.getByTestId('change-defaults'));
  expect(screen.getByTestId('change-defaults')).toBeCollapsed();
  expect(screen.queryByRole('radio', { name: 'EUR' })).not.toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText(FRONT_DOOR_COPY.name), 'Flat 3');
  await fireEvent.press(screen.getByRole('button', { name: FRONT_DOOR_COPY.submit }));
  expect(create).toHaveBeenCalledWith({ name: 'Flat 3', timezone: 'America/St_Johns', currency: 'EUR', weekStarts: 7, kind: 'housemates' });
});

it('says what the database refused, and lets you try again', async () => {
  create.mockRejectedValue(new Error("You’re already in a house. Leave it first to join another."));
  await render(<NewHouse />);
  await fireEvent.changeText(screen.getByLabelText(FRONT_DOOR_COPY.name), 'Flat 3');
  await fireEvent.press(screen.getByRole('button', { name: FRONT_DOOR_COPY.submit }));
  expect(screen.getByRole('alert')).toHaveTextContent("You’re already in a house. Leave it first to join another.");
  expect(screen.getByRole('button', { name: FRONT_DOOR_COPY.submit })).toBeEnabled();
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('offers the way in for someone with an invite', async () => {
  await render(<NewHouse />);
  expect(screen.getByRole('link', { name: FRONT_DOOR_COPY.invite })).toHaveProp('href', '/welcome');
});

describe('a family', () => {
  /** A kind's choice says what it means as well as its name. */
  beforeEach(() => {
    mockKind = 'family';
  });

  it('asks who lives here, with Family picked from the front door, and starts a family', async () => {
    create.mockResolvedValue('h1');
    await render(<NewHouse />);
    expect(screen.getByRole('header', { name: words('house.family.newHeading') })).toBeOnTheScreen();
    expect(screen.getByText(words('house.family.whoLivesHere'))).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: kindName('family') })).toBeChecked();
    // A family has no stake: the line starts with pocket money.
    expect(screen.getByTestId('house-defaults')).toHaveTextContent(
      line('Pocket money up to CAD 10 a month each', 'weeks start Monday', 'America/St Johns'),
    );
    await fireEvent.changeText(screen.getByLabelText(FRONT_DOOR_COPY.name), 'The Parks');
    await fireEvent.press(screen.getByRole('button', { name: words('house.family.submit') }));
    expect(create).toHaveBeenCalledWith({ name: 'The Parks', timezone: 'America/St_Johns', currency: 'CAD', weekStarts: 1, kind: 'family' });
  });

  it('can be changed back to housemates before it starts', async () => {
    create.mockResolvedValue('h1');
    await render(<NewHouse />);
    await fireEvent.press(screen.getByRole('radio', { name: kindName('housemates') }));
    expect(screen.getByRole('header', { name: NEW_HOUSE_COPY.heading })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(FRONT_DOOR_COPY.name), 'Flat 3');
    await fireEvent.press(screen.getByRole('button', { name: FRONT_DOOR_COPY.submit }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'housemates' }));
  });

  it('is asked of everyone, now families are open', async () => {
    mockKind = undefined;
    await render(<NewHouse />);
    expect(screen.getByText(words('house.family.whoLivesHere'))).toBeOnTheScreen();
  });
});

describe('from the Moving on screen', () => {
  beforeEach(() => {
    mockMoving = { fromHouse: 'h0', houseName: 'Flat 3', johns: 6 };
    mockFrom = 'h0';
  });

  it('is your new place, with the old list coming too', async () => {
    (startHouseFrom as jest.Mock).mockResolvedValue('h2');
    await render(<NewHouse />);
    expect(screen.getByRole('header', { name: MOVING_COPY.newHeading })).toBeOnTheScreen();
    expect(screen.getByText(MOVING_COPY.newIntro('Flat 3', 6))).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(FRONT_DOOR_COPY.name), 'New flat');
    await fireEvent.press(screen.getByRole('button', { name: FRONT_DOOR_COPY.submit }));
    expect(startHouseFrom).toHaveBeenCalledWith('h0', { name: 'New flat', timezone: 'America/St_Johns', currency: 'CAD', weekStarts: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('is a plain new house for any other link, or an empty old list', async () => {
    mockFrom = 'someone-else';
    await render(<NewHouse />);
    expect(screen.getByRole('header', { name: NEW_HOUSE_COPY.heading })).toBeOnTheScreen();
    mockFrom = 'h0';
    mockMoving = { fromHouse: 'h0', houseName: 'Flat 3', johns: 0 };
    await render(<NewHouse />);
    expect(screen.getByRole('header', { name: NEW_HOUSE_COPY.heading })).toBeOnTheScreen();
  });
});

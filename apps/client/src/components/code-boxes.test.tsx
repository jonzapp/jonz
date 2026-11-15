import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { focusRing, SPACE, TAP, themeFor } from '@/theme';

import { boxHeight, CodeBoxes } from './code-boxes';

/** The boxes as a screen holds them: the code in state, a problem until the next change. */
function Holder({ problem: first, onFilled }: { problem?: string; onFilled?: (code: string) => void }) {
  const [code, setCode] = useState(first ? '482913' : '');
  const [problem, setProblem] = useState(first);
  return (
    <CodeBoxes
      label="Code"
      hint="It's in the email we sent."
      problem={problem}
      value={code}
      onChangeText={(typed) => {
        setCode(typed);
        setProblem(undefined);
      }}
      onFilled={onFilled}
      testID="code"
    />
  );
}

const field = () => screen.getByTestId('code');
// The boxes are hidden from a screen reader, so a query has to be told to look at them.
const HIDDEN = { includeHiddenElements: true };
const BOX_IDS = [0, 1, 2, 3, 4, 5].map((index) => `code-box-${index}`);
const box = (id: string) => screen.getByTestId(id, HIDDEN);
/** How many boxes have a digit in them. */
const filled = () => BOX_IDS.filter((id) => within(box(id)).queryByText(/\d/, HIDDEN)).length;

it('is one field called Code that phones, Macs and password managers fill with a one-time code', async () => {
  await render(<Holder />);
  const input = screen.getByLabelText('Code');
  expect(input).toBe(field());
  expect(input.props).toMatchObject({
    textContentType: 'oneTimeCode',
    autoComplete: 'one-time-code',
    keyboardType: 'number-pad',
    inputMode: 'numeric',
    autoCorrect: false,
  });
  // The six boxes are a picture of the field: a screen reader hears the field once.
  expect(box('code-box-0').parent?.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.getByText("It's in the email we sent.")).toBeOnTheScreen();
});

it('puts one digit in each box as you type, and checks the code on the sixth without a tap', async () => {
  const onFilled = jest.fn();
  await render(<Holder onFilled={onFilled} />);
  await fireEvent.changeText(field(), '48');
  expect(within(box('code-box-0')).getByText('4', HIDDEN)).toBeOnTheScreen();
  expect(within(box('code-box-1')).getByText('8', HIDDEN)).toBeOnTheScreen();
  expect(filled()).toBe(2);
  expect(onFilled).not.toHaveBeenCalled();
  await fireEvent.changeText(field(), '482913');
  expect(onFilled).toHaveBeenCalledTimes(1);
  expect(onFilled).toHaveBeenCalledWith('482913');
  // A seventh digit goes nowhere, and the code isn't checked again.
  await fireEvent.changeText(field(), '4829137');
  expect(field().props.value).toBe('482913');
  expect(onFilled).toHaveBeenCalledTimes(1);
});

it('takes a pasted code with a space or a dash in it', async () => {
  const onFilled = jest.fn();
  await render(<Holder onFilled={onFilled} />);
  await fireEvent.changeText(field(), '123 456');
  expect(field().props.value).toBe('123456');
  expect(onFilled).toHaveBeenCalledWith('123456');
  await fireEvent.changeText(field(), '');
  await fireEvent.changeText(field(), '654-321');
  expect(field().props.value).toBe('654321');
  expect(onFilled).toHaveBeenLastCalledWith('654321');
});

it('puts the focus ring on the box the next digit goes in while the field has focus', async () => {
  const ring = focusRing(themeFor('light').colors);
  await render(<Holder />);
  await fireEvent.changeText(field(), '48');
  expect(box('code-box-2')).not.toHaveStyle({ boxShadow: ring.boxShadow });
  await fireEvent(field(), 'focus');
  expect(box('code-box-2')).toHaveStyle(ring);
  expect(box('code-box-1')).not.toHaveStyle({ boxShadow: ring.boxShadow });
  await fireEvent(field(), 'blur');
  expect(box('code-box-2')).not.toHaveStyle({ boxShadow: ring.boxShadow });
});

it('shows a wrong code on every box with the reason, and the next digit starts it over', async () => {
  await render(<Holder problem="That code isn't right." />);
  expect(screen.getByRole('alert')).toHaveTextContent("That code isn't right.");
  expect(screen.queryByText("It's in the email we sent.")).toBeNull();
  await fireEvent.changeText(field(), '4829137');
  expect(field().props.value).toBe('7');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps typing after a problem that came before the code was whole', async () => {
  const onChangeText = jest.fn();
  await render(<CodeBoxes label="Code" problem="Type all 6 digits." value="48" onChangeText={onChangeText} testID="code" />);
  await fireEvent.changeText(field(), '482');
  expect(onChangeText).toHaveBeenCalledWith('482');
});

it('makes each box a little taller than it is wide, from a thumb to a thumb and a third', () => {
  const box = (column: number) => boxHeight((column - 5 * SPACE.sm) / 6);
  // A small phone's sign-in card: never under a thumb.
  expect(box(260)).toBe(TAP);
  // In between, 5 tall to 4 wide.
  expect(box(300)).toBe(54);
  // A phone's page, or a laptop's form column: no taller than this.
  expect(box(358)).toBe(TAP + SPACE.lg);
  expect(box(520)).toBe(TAP + SPACE.lg);
});

it('sizes the boxes from the width the column gives them', async () => {
  await render(<Holder />);
  await fireEvent(screen.getByTestId('code-boxes'), 'layout', { nativeEvent: { layout: { width: 300, height: 0, x: 0, y: 0 } } });
  for (const index of [0, 5]) expect(box(`code-box-${index}`)).toHaveStyle({ height: 54 });
});

import { BIN_NIGHT } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { XIcon } from 'lucide-react-native';

import { focusRing, pressTint, RADIUS } from '@/theme';

import { Button } from './button';
import { Field } from './field';
import { focusRingRules } from './focus-rings';
import { Row } from './row';
import { SearchBox } from './search-box';

// Look A (docs/style/controls.md, "State and focus"): one focus ring, a hover
// tint, corners of 8.
const light = BIN_NIGHT.light;
const ring = focusRing(light);

describe('the focus ring', () => {
  it("is the ring colour's edge with a soft halo, ink by day and amber after dark", () => {
    expect(ring).toEqual({ borderColor: light.ring, boxShadow: `0 0 0 3px ${light.ring}4d` });
    expect(focusRing(BIN_NIGHT.dark).borderColor).toBe(BIN_NIGHT.dark.hivis);
  });

  it('turns a button\'s edge for the keyboard, and draws a row\'s inside its edges', () => {
    const rules = focusRingRules(ring);
    expect(rules).toContain(`[data-ring="edge"]:focus-visible { border-color: ${light.ring} !important; box-shadow: ${ring.boxShadow} !important; }`);
    expect(rules).toContain(`[data-ring-row]:has([data-ring="row"]:focus-visible) { box-shadow: inset 0 0 0 1px ${light.ring}, inset 0 0 0 4px ${light.ring}4d; }`);
    // Only where it's drawn is the browser's own outline taken away.
    expect(rules).toContain('[data-ring]:focus-visible { outline: none; }');
  });

  it("is on a text box while you type in it, and still tells the screen it's focused", async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<Field label="Name" value="" onFocus={onFocus} onBlur={onBlur} />);
    const box = screen.getByLabelText('Name');
    expect(box).not.toHaveStyle({ boxShadow: ring.boxShadow });
    await fireEvent(box, 'focus');
    expect(box).toHaveStyle(ring);
    expect(onFocus).toHaveBeenCalledTimes(1);
    await fireEvent(box, 'blur');
    expect(box).not.toHaveStyle({ boxShadow: ring.boxShadow });
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('is on the search box round the words, not a thicker edge', async () => {
    await render(<SearchBox value="" onChange={() => {}} placeholder="Search zones" />);
    await fireEvent(screen.getByTestId('search-box-input'), 'focus');
    expect(screen.getByTestId('search-box')).toHaveStyle({ ...ring, borderWidth: 1 });
  });
});

describe('the hover tint', () => {
  it("washes a button with no fill as a press does, and lightens a filled one a little", async () => {
    await render(
      <>
        <Button label="Close" icon={XIcon} variant="ghost" onPress={() => {}} testID="ghost" />
        <Button label="Save" variant="primary" onPress={() => {}} testID="primary" />
      </>,
    );
    await fireEvent(screen.getByTestId('ghost'), 'hoverIn');
    expect(screen.getByTestId('ghost')).toHaveStyle({ backgroundColor: pressTint(light) });
    await fireEvent(screen.getByTestId('ghost'), 'hoverOut');
    expect(screen.getByTestId('ghost')).toHaveStyle({ backgroundColor: 'transparent' });
    await fireEvent(screen.getByTestId('primary'), 'hoverIn');
    expect(screen.getByTestId('primary')).toHaveStyle({ backgroundColor: light.hivis, opacity: 0.92 });
  });

  it('washes a row you can open, and never a switched-off one', async () => {
    await render(
      <>
        <Row title="Bins out" onPress={() => {}} testID="row" />
        <Row title="Mop" onPress={() => {}} disabled testID="off" />
      </>,
    );
    await fireEvent(screen.getByRole('button', { name: 'Bins out' }), 'hoverIn');
    expect(screen.getByTestId('row-tint')).toHaveStyle({ backgroundColor: pressTint(light) });
    await fireEvent(screen.getByRole('button', { name: 'Bins out' }), 'hoverOut');
    expect(screen.queryByTestId('row-tint')).toBeNull();
    await fireEvent(screen.getByRole('button', { name: 'Mop' }), 'hoverIn');
    expect(screen.queryByTestId('off-tint')).toBeNull();
  });
});

it('rounds buttons and boxes to 8', async () => {
  expect(RADIUS).toBe(8);
  await render(<Button label="Save" onPress={() => {}} testID="save" />);
  expect(screen.getByTestId('save')).toHaveStyle({ borderRadius: 8 });
});

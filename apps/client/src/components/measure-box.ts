import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';

/** Where a box is in the window, and its size. */
export interface BoxFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a box that opens a list sits in the window (a Select's, a
 * Combobox's), for the list to float from it. Jest's host views never
 * answer measureInWindow, so tests swap this for a box at a fixed spot
 * (jest.setup.js).
 */
export function measureBox(box: RefObject<HostInstance | null>, then: (frame: BoxFrame) => void) {
  box.current?.measureInWindow((x, y, width, height) => then({ x, y, width, height }));
}

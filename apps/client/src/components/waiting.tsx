import { FOCUS_SHELL_COPY } from '@app/core';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { OutlinePage } from '@/components/outline';
import { ReadFailed } from '@/components/read-state';
import { useWaitShown } from '@/hooks/use-wait-shown';

type Failing = { failed?: undefined; onRetry?: undefined } | { failed: boolean; onRetry: () => void };

/**
 * A page, a part of one, a panel or a sheet that reads before it can show
 * (docs/style/states.md, "Waiting"). Until `ready` it shows `outline`, the
 * part's own shape in blank (pieces in outline.tsx; a generic page by
 * default), after WAIT_DELAY and for at least WAIT_MIN. A screen reader
 * hears `label` ("Reading the Table") and that it's busy. When `failed`
 * before it's ready, it shows the sentence and Try again (`ReadFailed`). `children` may be a
 * function, called only once it's ready, for content that reads the data.
 */
export function Waiting({
  ready,
  failed,
  onRetry,
  label = FOCUS_SHELL_COPY.reading,
  outline,
  children,
  fill = false,
  testID,
}: {
  ready: boolean;
  /** The outline fills its page (a page in two Columns), as the page's own content does. */
  fill?: boolean;
  label?: string;
  outline?: ReactNode;
  /** What it shows once read; none when the page draws that itself (`ready` stays false here). */
  children?: ReactNode | (() => ReactNode);
  testID?: string;
} & Failing) {
  const shown = useWaitShown(!ready && !failed);
  // A read that failed with nothing to show; a later read failing over what's shown leaves it shown.
  if (failed && !ready && onRetry) return <ReadFailed onRetry={onRetry} />;
  if (shown || !ready) {
    return (
      <View
        testID={testID ?? 'waiting'}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        aria-busy
        style={fill && shown ? FILL : undefined}
      >
        {/* Before WAIT_DELAY it holds no outline yet: nothing to see, but busy all the same. */}
        {shown ? (outline ?? <OutlinePage />) : null}
      </View>
    );
  }
  return <>{typeof children === 'function' ? children() : children}</>;
}

const FILL = { flex: 1 } as const;

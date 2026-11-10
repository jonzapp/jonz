import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

import { PageTitle } from '@/components/page-title';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { Waiting } from '@/components/waiting';
import { useWords } from '@/hooks/use-words';

/**
 * A page House pushes (the John list, the rules, time away, groups, a
 * housemate): its title bar with the way back, the browser tab's title,
 * and its first read: `outline`, the page's shape in blank, while it reads
 * (page-outlines.tsx), or the sentence and Try again if it can't.
 * `children` is called once `ready`, so it can use what was read without
 * checking again.
 */
export function HousePage({
  title,
  testID,
  ready,
  failed,
  onRetry,
  refreshing,
  onRefresh,
  back = '/house',
  backLabel,
  fills = false,
  outline,
  label,
  children,
}: {
  title: string;
  testID: string;
  ready: boolean;
  failed: boolean;
  onRetry: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  back?: Href;
  /** Where `back` goes, in words: House unless it says otherwise. */
  backLabel?: string;
  /** On a laptop the page fills the room beside House's list, its sections in columns (Pair, Flow). */
  fills?: boolean;
  /** The page's shape while it first reads (page-outlines.tsx); rows in groups if none. */
  outline?: ReactNode;
  /** What a screen reader hears while it reads: "Reading the house" if none. */
  label?: string;
  children: () => ReactNode;
}) {
  const words = useWords();
  backLabel ??= words('common.section.house');
  return (
    <Screen
      bar={<TitleBar title={title} back={back} backLabel={backLabel} />}
      fills={fills}
      refreshing={refreshing}
      onRefresh={onRefresh}
      testID={testID}
    >
      <PageTitle page={title} />
      <Waiting ready={ready} failed={failed} onRetry={onRetry} outline={outline} label={label}>
        {children}
      </Waiting>
    </Screen>
  );
}

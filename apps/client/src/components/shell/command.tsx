import { weekItemOf } from '@app/core';
import { router, type Href } from 'expo-router';
import { SearchIcon } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { CommandBox, CommandCard } from '@/components/command-box';
import { RING_PART } from '@/components/focus-rings';
import { InputBox } from '@/components/input-group';
import { Kbd, onMac } from '@/components/kbd';
import { useJohnSheet } from '@/components/john-sheet';
import { useHouse } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useWords } from '@/hooks/use-words';
import { useTheme } from '@/theme';

import { commandGroups, type CommandHouse } from './command-hits';

/** Opens the command box from anywhere in the house: the rail's Search does. */
const CommandContext = createContext<(() => void) | null>(null);

/**
 * The house's command box, round every tab: Ctrl K (⌘K on a Mac) opens it
 * from anywhere on the web, and again puts it away, as the rail's Search
 * opens it on a laptop (`RailSearch`). It searches the house's pages, its
 * Johns and its people, read only while it's open.
 */
export function CommandProvider({ houseId, userId, children }: { houseId: string; userId: string; children: ReactNode }) {
  const words = useWords();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setOpen((was) => !was);
      setQuery('');
    };
    // On the way down, before a text box (the box's own search among them) keeps the keys to itself.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <CommandContext.Provider value={show}>
      {children}
      <CommandBox open={open} onClose={close} label={words('common.command.title')}>
        <HouseCommand houseId={houseId} userId={userId} query={query} onQuery={setQuery} onClose={close} />
      </CommandBox>
    </CommandContext.Provider>
  );
}

/** The box's card for this house: what it finds for what's typed, and where each goes. */
function HouseCommand({
  houseId,
  userId,
  query,
  onQuery,
  onClose,
}: {
  houseId: string;
  userId: string;
  query: string;
  onQuery: (query: string) => void;
  onClose: () => void;
}) {
  const words = useWords();
  const { view } = useHouse(houseId, userId);
  const list = useJohnList(houseId);
  const sheet = useJohnSheet();
  const house: CommandHouse = {
    userId,
    family: view?.snapshot.house.kind === 'family',
    kid: view?.snapshot.house.kind === 'family' && view.me?.role !== 'admin',
    people: view?.snapshot.members ?? [],
    johns: list.data?.johns ?? [],
    kinds: list.data?.kinds ?? [],
  };
  const to = {
    href: (href: Href) => {
      onClose();
      router.navigate(href);
    },
    john: (johnId: string) => {
      onClose();
      // This week's: its sheet, yours first; else the John list, where every John opens.
      const item = view ? weekItemOf(view.board.items, johnId, userId) : null;
      if (item) sheet.open(item.id);
      else router.navigate('/house/johns');
    },
  };
  return (
    <CommandCard
      query={query}
      onQuery={onQuery}
      groups={commandGroups({ query, house, to }, words)}
      placeholder={words('common.command.placeholder')}
      none={words('common.command.none', { query: query.trim() })}
      onClose={onClose}
    />
  );
}

/**
 * The rail's way into the command box, on a laptop, under the house's
 * name: a search box that opens it, Search in it, and its keys at its end.
 */
export function RailSearch() {
  const words = useWords();
  const { colors, type } = useTheme();
  const show = useContext(CommandContext);
  if (!show) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words('common.command.placeholder')}
      onPress={show}
      testID="rail-search"
      {...(Platform.OS === 'web' ? ({ dataSet: RING_PART } as object) : {})}
    >
      <InputBox ring start={<SearchIcon size={20} color={colors.mutedForeground} aria-hidden />}>
        <Text style={[type.body, styles.words, { color: colors.mutedForeground }]}>{words('common.command.search')}</Text>
        <Kbd>{words('common.keys.ctrlK', { mac: onMac() ? 'yes' : 'no' })}</Kbd>
      </InputBox>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  words: { flex: 1 },
});

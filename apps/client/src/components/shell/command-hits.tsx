import { finds, kindOf, PAGES, type JohnDef, type KindDef, type PageName, type WordId, type Words } from '@app/core';
import type { Href } from 'expo-router';
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  CoinsIcon,
  HouseIcon,
  ListChecksIcon,
  ListTodoIcon,
  MegaphoneIcon,
  PlaneIcon,
  ScrollTextIcon,
  TicketIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react-native';

import { Avatar } from '@/components/avatar';
import type { CommandGroup, CommandHit } from '@/components/command-box';
import { useTheme } from '@/theme';

/** The most Johns a search lists: more than that, and typing more finds the one. */
const MOST_JOHNS = 6;

/** A page the box finds: its title, its icon, and the place it's under, when it isn't one itself. */
interface CommandPage {
  page: PageName;
  title: WordId;
  icon: LucideIcon;
  under?: 'week' | 'house';
}

/**
 * The pages the box finds, in the rail's order: the four places, then the
 * pages under them. Their addresses are the ones a chat with Jonz links to
 * (PAGES). History and Groups aren't pages any more (their old links land on
 * the Wall and the John list).
 */
const COMMAND_PAGES: readonly CommandPage[] = [
  { page: 'today', title: 'common.title.today', icon: ListChecksIcon },
  { page: 'week', title: 'common.title.week', icon: CalendarDaysIcon },
  { page: 'shares', title: 'week.record.title', icon: ChartColumnIcon, under: 'week' },
  { page: 'house', title: 'common.title.house', icon: HouseIcon },
  { page: 'johns', title: 'common.title.johnList', icon: ListTodoIcon, under: 'house' },
  { page: 'rules', title: 'common.title.rules', icon: ScrollTextIcon, under: 'house' },
  { page: 'away', title: 'common.title.away', icon: PlaneIcon, under: 'house' },
  { page: 'wall', title: 'wall.page.title', icon: MegaphoneIcon, under: 'house' },
  { page: 'stake', title: 'house.stake.title', icon: CoinsIcon, under: 'house' },
  { page: 'pass', title: 'common.title.pass', icon: TicketIcon, under: 'house' },
  { page: 'guide', title: 'door.guide.title', icon: BookOpenIcon, under: 'house' },
  { page: 'you', title: 'common.title.you', icon: UserRoundIcon },
];

/** What the box searches in this house, and who's searching. */
export interface CommandHouse {
  userId: string;
  /** A family has no Stake. */
  family: boolean;
  /** A kid in a family: the Pass isn't theirs to buy. */
  kid: boolean;
  people: readonly { userId: string; name: string }[];
  johns: readonly JohnDef[];
  kinds: readonly KindDef[];
}

/** Where a hit goes: a page, or a John (its sheet when it's this week's, else the John list). */
export interface CommandTo {
  href: (href: Href) => void;
  john: (johnId: string) => void;
}

/**
 * What the box finds for `query`: with nothing typed, every page; typed,
 * the Johns, the housemates and the pages it finds (each word typed starts
 * a word of the name), in that order, a group left out when it finds none.
 * A John's meta is its kind (after the kind's lid bar), a page's the place
 * it's under, and yours says it's you.
 */
export function commandGroups({ query, house, to }: { query: string; house: CommandHouse; to: CommandTo }, words: Words): CommandGroup[] {
  const typed = query.trim() !== '';
  const pages = COMMAND_PAGES.filter((p) => !(p.page === 'stake' && house.family) && !(p.page === 'pass' && house.kid))
    .map((p) => ({ ...p, name: words(p.title) }))
    .filter((p) => finds(query, p.name))
    .map<CommandHit>((p) => ({
      key: `page-${p.page}`,
      leading: <HitIcon icon={p.icon} />,
      title: p.name,
      meta: p.under ? words(`common.section.${p.under}`) : undefined,
      go: () => to.href(PAGES[p.page].href as Href),
    }));
  const johns = typed ? house.johns.filter((j) => finds(query, j.name)).slice(0, MOST_JOHNS).map((john) => johnHit(john, { house, to }, words)) : [];
  const people = typed
    ? house.people.filter((p) => finds(query, p.name)).map<CommandHit>((p) => ({
        key: `person-${p.userId}`,
        leading: <Avatar name={p.name} userId={p.userId} me={p.userId === house.userId} size={24} />,
        title: p.name,
        meta: p.userId === house.userId ? words('week.table.you') : undefined,
        go: () => to.href(`/house/people/${p.userId}` as Href),
      }))
    : [];
  return [
    { label: words('common.command.johns'), hits: johns },
    { label: words('common.command.people'), hits: people },
    { label: words('common.command.pages'), hits: pages },
  ].filter((group) => group.hits.length > 0);
}

/** A John the box found: its kind as its meta, after the kind's lid bar. */
function johnHit(john: JohnDef, { house, to }: { house: CommandHouse; to: CommandTo }, words: Words): CommandHit {
  const kind = kindOf(john, house.kinds);
  return {
    key: `john-${john.id}`,
    leading: <HitIcon icon={ListTodoIcon} />,
    title: john.name,
    meta: kind?.name ?? words('house.kinds.none'),
    lid: kind?.colour ?? 'other',
    go: () => to.john(john.id),
  };
}

/** A page's or a John's icon, in the quieter ink. */
function HitIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { colors } = useTheme();
  return <Icon size={20} color={colors.mutedForeground} aria-hidden />;
}

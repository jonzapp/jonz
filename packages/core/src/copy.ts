/**
 * The words both apps say before anyone signs in: the name, the tagline and
 * the front door. One copy, so the web and the phone can't tell the house
 * different things.
 */
export const APP_NAME = "Jonz";
export const TAGLINE = "Fair shares of the housework, and a house that keeps score.";

/** A page's title in the browser tab: "Today · Jonz", or just the name on the front door. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

/** What each page is called in the browser tab, as the web's metadata names them. */
export const PAGE_TITLE = {
  signIn: "Sign in",
  newHouse: "Start your house",
  newFamily: "Start your family",
  join: "Join a house",
  today: "Today",
  week: "This week",
  house: "House",
  privacy: "Privacy",
  terms: "Terms",
  help: "Help",
  notFound: "Nothing here",
  welcome: "No house yet",
  johnList: "The John list",
  rules: "House rules",
  /** Your days and best time (what used to be Preferences) beside the house's time away. */
  away: "Days and time away",
  groups: "Groups",
  describe: "Describe your house",
  ask: `Ask ${APP_NAME}`,
  pass: "House Pass",
  prefs: "Preferences",
  moving: "Moving out",
  movingOn: "Moving on",
  /** Your own page under House: your name, look and sign-in, help, and leaving. */
  you: "You",
  deleteAccount: "Delete your account",
} as const;

export type SignInProvider = "Google" | "Apple" | "Microsoft";

/** The words for the two roles, by kind of house: what an admin and everyone else are called. */
export const ROLE_WORDS = {
  housemates: { admin: "admin", admins: "admins", member: "housemate", Admin: "Admin", Admins: "Admins", Member: "Housemate", anAdmin: "an admin", aMember: "a housemate" },
  family: { admin: "parent", admins: "parents", member: "kid", Admin: "Parent", Admins: "Parents", Member: "Kid", anAdmin: "a parent", aMember: "a kid" },
} as const;

/** A house's screens, in the order the tabs and the sidebar show them. */
export const SECTIONS = ["today", "week", "wall", "table", "stake", "house"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  today: "Today",
  week: "Week",
  wall: "Wall",
  table: "Table",
  stake: "Stake",
  house: "House",
};

/** The house and you, at the foot of the laptop's sidebar. */
export const SHELL_COPY = {
  close: "Close",
  standing: (streak: number, tokens: number) => `${streak}-week streak, ${tokens} ${tokens === 1 ? "skip" : "skips"}`,
} as const;

const waitingForYourVote = (count: number) => `${count} waiting for your vote`;
const waitingForYourOk = (count: number) => `${count} waiting for your OK`;

/**
 * Focus's shell: the words of the tabs, the rail, the title bars and the
 * pieces every screen is built from. Each screen's own words live in its
 * own object, at the end of this file.
 */
export const FOCUS_SHELL_COPY = {
  /** A pushed page's way back. */
  back: "Back",
  /** The way back, spoken, when it shows the place it goes to ("‹ House"): "Back to House". */
  backTo: (place: string) => `Back to ${place}`,
  /** The title bar's "•••" button, which opens the screen's menu. */
  more: "More",
  /** The tabs, or the rail, to a screen reader. */
  places: "Places",
  /** A tab's spoken name, with its badge when it has one: "Today, 1 waiting for your vote" (in a family, "your OK"). */
  tab: (label: string, toVote: number, family = false) =>
    toVote > 0 ? `${label}, ${family ? waitingForYourOk(toVote) : waitingForYourVote(toVote)}` : label,
  /** The fold that keeps finished Johns out of the way. */
  done: (count: number) => `Done (${count})`,
  reading: "Reading the house",
  unreadable: "Couldn’t read the house. Check the connection.",
  retry: "Try again",
  /** A confirm sheet's way out without doing it. */
  cancel: "Cancel",
  /** House's setup pages, as a section: they change the house for everyone. */
  setup: "House setup",
  /** A housemate's page for someone who isn't in the house any more. */
  gone: "They’re not in the house any more.",
  /** Someone in the house's history who has since left. */
  formerHousemate: "Someone who left",
} as const;

/** You: your name, the way out, and leaving. */
/** The look: day, night, or whatever this device is set to. */
export const LOOKS = ["light", "dark", "system"] as const;
export type Look = (typeof LOOKS)[number];
export const LOOK_LABEL: Record<Look, string> = { light: "Day", dark: "Night", system: "Auto" };

/** A look as it was saved on a device, or "system" for anything else (nothing saved, an old value). */
export function lookOf(saved: string | null | undefined): Look {
  return (LOOKS as readonly string[]).includes(saved ?? "") ? (saved as Look) : "system";
}

/** A housemate's page. */
/**
 * The foot of every long list (the Wall, History, the Audit log, and later
 * Houses), the same everywhere: more loads as you near the end, and the foot
 * says how far back you are, that it's reading, or that there's no more.
 */
/**
 * What a button says while it waits on the server, in place of its own
 * words (docs/style/states.md, "Waiting"): what is happening, as -ing words,
 * no dots. A button with its own (PROMOTIONS_COPY.making) uses that.
 */
export const BUSY_COPY = {
  saving: "Saving",
  deleting: "Deleting",
  stopping: "Stopping",
  starting: "Starting",
  sending: "Sending",
  sendingTest: "Sending the test",
  trying: "Trying again",
  emailing: "Emailing",
  keeping: "Keeping it",
  signingOut: "Signing out",
  removing: "Removing",
  reopening: "Reopening",
  adding: "Adding",
  resetting: "Resetting",
  undoing: "Undoing",
  ending: "Ending",
  dealing: "Dealing",
  turningOn: "Turning on",
  turningOff: "Turning off",
  markingPaid: "Marking paid",
  accepting: "Accepting",
  declining: "Declining",
  voting: "Voting",
  asking: "Asking",
  approving: "Approving",
  planning: "Planning",
  leaving: "Leaving",
  handingOver: "Handing over",
  switching: "Switching",
} as const;

export const LIST_COPY = {
  loading: "Loading more",
  /** For a keyboard, a screen reader, or a page too short to scroll. */
  more: "Show more",
  /** How far back what's shown goes, for a list without a count: "Showing back to Tue 27 Oct". */
  backTo: (day: string) => `Showing back to ${day}`,
  /** For a list with a count. */
  of: (shown: number, total: number) => `Showing ${shown} of ${total}`,
  /** Under the oldest there is. */
  everything: "That’s everything.",
  failed: "Couldn’t read any more. Check the connection.",
  /** A busy admin list's search, taken back to everything. */
  clear: "Clear",
  noMatch: "Nothing matches",
  noMatchBody: "Try other words, or clear the filters.",
  /** What a screen reader hears while a new search or filter reads. */
  searching: "Searching",
  /** While a list's first page reads. */
  reading: "Reading the list",
} as const;

/** Describe your house: Claude drafts the John list, or a starter list does, and an admin keeps what they want. */
export const HOUSE_DRAFT_COPY = {
  title: "Describe your house",
  /** Jonz's first message, over the starter lists. */
  greeting: `Tell me about the house: who lives there, and anything that always gets missed. I’ll draft the Johns, and nothing is added until you keep them.`,
  /** Under the greeting: start from a list instead. */
  orStart: "Or start from a list:",
  starter: {
    flat_share: { title: "Flat share", meta: "Housemates sharing a kitchen and bathroom" },
    couple: { title: "Couple", meta: "Two of you" },
    family: { title: "Family", meta: "Parents and kids" },
  },
  /** The message box, before and after there's a draft to change. */
  placeholder: "Four of us, two bathrooms…",
  placeholderChange: "Try “oven every month”",
  message: "Message",
  send: "Send",
  privacy: "What you write is sent to Anthropic’s Claude, through Vercel, to answer. Only you can see your chats, and they’re kept until you delete them.",
  /** While Jonz is answering. */
  thinking: `${APP_NAME} is thinking…`,
  /**
   * What Jonz is doing while it answers, one after another on a timer (the
   * answer comes back whole, so these are what every turn does, never live).
   * The second says "your list" once there is one to look at.
   */
  thinkingSteps: (list: boolean) => [
    "Reading what you wrote",
    list ? "Looking at your list" : "Picturing your house",
    "Weighing who does what",
    "Writing a reply",
  ],
  /** Over Jonz's answer, folded: how long it took. Opens to the steps. */
  thought: (seconds: number) => `Thought for ${seconds}s`,
  /** The day picker's name, for a screen reader. */
  pickDay: "Pick a day",
  /** The draft card: its label, the line under it, and how it opens and closes. */
  draftLabel: "Your draft",
  draftMeta: (n: number, points: number) => `${n === 1 ? "1 John" : `${n} Johns`}, ${points} pts a week`,
  seeAll: (n: number) => `See all ${n}`,
  showLess: "Show less",
  fromStarter: "Here’s a starter list. Tell me what’s different about your house and I’ll change it, or untick any you don’t want.",
  /** Claude couldn't be reached, so a starter list stands in. */
  offline: "I couldn’t draft from that just now, so here’s a starter list to begin with. Untick any you don’t want; you can change each one after.",
  /** Claude couldn't be reached to change a draft that's already there. */
  offlineChange: "I couldn’t change the draft just now. Try again in a minute, or add it and change the Johns on the list.",
  groupsLabel: "Groups",
  /** A drafted group's meta line: who's in it, and who it waits for. */
  waiting: (names: string) => `waiting for ${names} to join`,
  /** Under a group nobody in it has joined yet. */
  everyoneForNow: (groups: string) => `Until someone in ${groups} joins, its Johns go to everyone. Make the group under House once they have.`,
  /** The primary button: how many Johns keeping adds. */
  keep: (n: number) => (n === 0 ? "Pick at least one John" : n === 1 ? "Add 1 John" : `Add ${n} Johns`),
  keeping: "Adding…",
  /** After keeping, in the chat. */
  added: (n: number) => (n === 1 ? "1 John added" : `${n} Johns added`),
  addedMeta: "Deal the week once everyone’s in",
  openList: "Open the list",

  // A house with a list already: the chat changes it (the House Pass's assistant).
  /** The AI button in the title bar, to a screen reader. */
  open: `Ask ${APP_NAME}`,
  greetingList: "What would you like to change? I can add Johns, change them or take some off, and nothing changes until you apply it.",
  placeholderList: "Sam’s moving out…",
  /** The card's line over its changes: the house's points a week before and after. */
  changesMeta: (before: number, after: number) => (before === after ? `${after} pts a week` : `${before} → ${after} pts a week`),
  /** The card's three headings, in the order it shows them: what goes, what changes, what's new. */
  removingHeading: "Taking off",
  changingHeading: "Changing",
  /** A group the house has, with new people in it, under Changing: "You and Sam → you, Sam and Ivy". */
  groupPeople: (before: string, after: string) => `${before} → ${after}`,
  addingHeading: "Adding",
  apply: (n: number) => (n === 0 ? "Pick at least one change" : n === 1 ? "Apply 1 change" : `Apply ${n} changes`),
  applying: "Applying…",
  applied: (n: number) => (n === 1 ? "1 change made" : `${n} changes made`),
  appliedMeta: "From the next deal",
  /** For someone who can't change the list (a member, a kid): Jonz answers questions. */
  greetingAsk: "Ask me about the house: who has what this week, who’s away, how fair shares stand, or what a rule means.",
  placeholderAsk: "Who’s on bins this week?",
  /** Over the questions to tap, under the greeting of a chat about a house that has a list. */
  orAsk: "Or tap a question:",
  /** Three questions to tap, to show what Jonz can answer. Each is sent as written. */
  examples: ["Who has what this week?", "Who’s away soon?", "How do fair shares stand?"],
  /** Claude couldn't be reached to answer a question. */
  offlineAsk: "I couldn’t answer just now. Try again in a minute.",
  /** In place of the message box, for a house without the Pass. */
  passNeeded: `Changing your list with ${APP_NAME} comes with the House Pass. Setting up a new house stays free.`,
  seePass: "See the House Pass",
} as const;

/** A share, 0 to 1, as a whole percent, never rounded up to 100 or down to 0. */
function percent(share: number): number {
  const n = Math.round(share * 100);
  return share > 0 && n === 0 ? 1 : share < 1 && n === 100 ? 99 : n;
}

/**
 * Ask Jonz's week: the warning over the message box when it's low, the
 * notice in its place once it's all used, and the usage page (House, setup).
 * `backOn` is the weekday and time the house's week starts.
 */
export const ASK_USAGE_COPY = {
  title: `Ask ${APP_NAME} usage`,
  /** Its row on House: what's left of yours. */
  rowMeta: (left: number) => `${percent(left)}% of yours left this week`,
  thisWeek: "This week",
  resets: (backOn: string) => `Resets ${backOn}`,
  house: "The house",
  houseNote: (people: number) => (people < 2 ? "Just you" : people === 2 ? "Between the two of you" : `Between all ${people} of you`),
  you: "You",
  youNote: "Of your half: nobody can use more than half the house’s",
  whoUsed: "Who used it",
  used: (share: number) => `${percent(share)}% used`,
  /** Under the page, for a house without the Pass. */
  passMore: "With the House Pass the house gets five times as much.",
  /** Over the message box once under a quarter is left. */
  low: (left: number, house: boolean, backOn: string) =>
    `Only ${percent(left)}% of ${house ? "the house’s" : "your"} Ask ${APP_NAME} left this week. More on ${backOn}.`,
  lowLabel: "See usage",
  /** In place of the message box once it's all used. */
  outHouse: `The house has used this week’s Ask ${APP_NAME}`,
  outMine: "You’ve used your half this week",
  outHouseNote: (backOn: string, pass: boolean) =>
    `Back for everyone ${backOn}.${pass ? "" : " With the House Pass the house gets five times as much."}`,
  outMineNote: (backOn: string) => `Back ${backOn}. Nobody can use more than half, so the others still have theirs.`,
  seeUsage: "See usage",
  getPass: "Get the House Pass",
} as const;

/** What a pasted link's card says (share.ts draws it). */
export const SHARE_COPY = {
  /** The brand card's description: every page but a join link. */
  description: TAGLINE,
  imageAlt: `${APP_NAME}: fair shares of the housework.`,
  joinTitle: (house: string) => `Join ${house} on ${APP_NAME}`,
  joinGeneric: `You’re invited to a house on ${APP_NAME}`,
  joinLine: "Sign in to join and get your Johns.",
  /** A code that opens nothing: reset, or its house is empty. */
  expiredTitle: "This invite has expired",
  expiredLine: "Ask the house for a new link.",
  offerEnded: "This offer has ended",
  offerEndedLine: "Ask for a new link.",
} as const;

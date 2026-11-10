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

/** A page that isn't there, and a page that broke. */
export const NOT_FOUND_COPY = {
  title: "Nothing here",
  body: "That page isn’t on the list.",
  back: "Back to your Johns",
  /** Signed out, there are no Johns to go back to. */
  backToDoor: "Back to the front door",
} as const;

export const ERROR_COPY = {
  title: "Something went wrong",
  body: "It wasn’t you. Try again, and if it keeps happening, tell us what happened.",
  retry: "Try again",
  /** The crash screen's way to report it (docs/specs/report-a-problem.md, step 3). */
  tell: "Tell us what happened",
  tellTitle: "What happened?",
  told: "Sent, thank you. We’ll reply under House, Your reports, and by email.",
  orEmail: "Or email support@jonz.app.",
  /** Your house couldn't be read, so no screen can be chosen yet. */
  unreachable: "Can’t reach your house",
  unreachableBody: "Check the connection, then try again.",
} as const;

export const FRONT_DOOR = {
  headline: "Jonz: who’s on what this week.",
  signIn: "Sign in",
} as const;

export type SignInProvider = "Google" | "Apple" | "Microsoft";

/**
 * The sign-in screen's words. The reason line under the heading comes from
 * `signInReason` (auth-paths.ts); iOS also offers Apple, so it says
 * `eitherAccount` instead (Hide My Email makes a new person). Every screen
 * offers more than one account, so `sameAccount` warns that a second one
 * starts with no house.
 */
export const SIGN_IN_COPY = {
  heading: "Sign in",
  google: "Continue with Google",
  googleBusy: "Opening Google…",
  microsoft: "Continue with Microsoft",
  microsoftBusy: "Opening Microsoft…",
  eitherAccount: "Your house’s Johns are kept with the account you sign in with.",
  sameAccount: "Already in a house? Use the account you joined with.",
  terms: "By continuing you agree to the Terms and the Privacy Policy, and to the rules of the house you join, and say you’re 13 or older.",
  privacy: "Privacy",
  termsLink: "Terms",
  failed: (provider: SignInProvider) => `${provider} didn’t finish signing you in. Try again.`,
  /** The web came back from Google or Microsoft with an error, and can't tell which. */
  returnFailed: "That sign-in didn’t finish. Try again.",
  signOut: "Sign out",
} as const;

/** Setting up a house: the web's /house/new and the app's. */
export const NEW_HOUSE_COPY = {
  heading: "Start your house",
  intro: "You’ll be its admin. Next you add the Johns and send the house an invite.",
  name: "What do you call the house?",
  namePlaceholder: "Flat 3",
  currency: "Currency",
  weekStarts: "The week starts on",
  timezone: "Time zone",
  busy: "Setting up…",
} as const;

/** The words for the two roles, by kind of house: what an admin and everyone else are called. */
export const ROLE_WORDS = {
  housemates: { admin: "admin", admins: "admins", member: "housemate", Admin: "Admin", Admins: "Admins", Member: "Housemate", anAdmin: "an admin", aMember: "a housemate" },
  family: { admin: "parent", admins: "parents", member: "kid", Admin: "Parent", Admins: "Parents", Member: "Kid", anAdmin: "a parent", aMember: "a kid" },
} as const;

/** An invite: the web's /join/[code] and the app's. */
export const JOIN_COPY = {
  badLink: "That link doesn’t work",
  /** A mistyped or cut-off code, or a house everyone has left (it closes behind the last one out). */
  badLinkBody: "It may be mistyped, or everyone has left that house. Ask whoever sent it for the link on their House screen, or start your own.",
  alreadyIn: (house: string) => `You’re already in ${house}`,
  goToJohns: "Go to your Johns",
  otherHouse: "You’re in another house",
  otherHouseBody: "Jonz keeps you in one house at a time. Leave your current one from its House screen first.",
  yourHouse: "Your house",
  invited: "You’re invited",
  livesHere: (people: number) =>
    `${people} ${people === 1 ? "person lives" : "people live"} here. Join and you’re dealt Johns from next week.`,
  join: (house: string) => `Join ${house}`,
  /** Before joining: what the house plays for, so nobody joins a money game without knowing. */
  stake: (stake: string, late: string, missed: string) =>
    `This house plays for money: ${stake} a month each, ${late} for a late John and ${missed} for a missed one, split between everyone else.`,
  noStake: "This house doesn’t play for money: it keeps score in points.",
  joining: "Joining…",
  back: "Back",
  /** The invite, before signing in: what comes next, under its button. */
  nextSignIn: "Next you sign in or make an account. Nothing is joined until you say so.",
  /** Signing in from an invite: under "Sign in", in place of the usual line. */
  signInFor: (house: string) => `Sign in to join ${house}.`,
} as const;

/** Signed in with no house: the app's way to start one or join by code. */
export const NO_HOUSE_COPY = {
  heading: "No house yet",
} as const;

/** The invite, ready for the group chat. */
export const INVITE_COPY = {
  copied: "Link copied",
  shareTitle: (house: string) => `Join ${house} on Jonz`,
  /** Admins only: a fresh code, for when a link has gone somewhere it shouldn't. */
  newCode: "New code",
  newCodeNote: "The old link and code stop working. Removing someone changes the code too.",
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

/** The whole Wall, by day. */
export const WALL_FEED_COPY = {
  /** A message from Jonz itself with no subject (it always has one). */
  fromJonz: "From Jonz",
  /** House's way to the whole Wall, and what it says to a screen reader. */
  seeAll: "See all",
  seeAllOf: (wall: string) => `See all of ${wall}`,
  emptyTitle: "Nothing on the Wall yet",
  reading: "Reading the Wall",
  unreadable: "Couldn’t read the Wall. Check the connection.",
  today: "Today",
  yesterday: "Yesterday",
  /** How long ago, after the meta line's words: "Checking, 3h". */
  justNow: "just now",
  minutes: (n: number) => `${n} min`,
  hours: (n: number) => `${n}h`,
  days: (n: number) => `${n} ${n === 1 ? "day" : "days"}`,
  /** Who did it, when the event says nobody. */
  someone: "Someone",
  /** The viewer, as a sentence's subject, its object, and an owner. */
  you: "You",
  youObject: "you",
  your: "your",
  /** A John the event doesn't name. */
  aJohn: "a John",
  theJohn: "the John",
  // Each event as a row's one sentence, with first names. `whose` arrives as
  // "Priya’s", "your" or "a former housemate’s".
  ticked: (who: string, john: string) => `${who} ticked ${john}`,
  missed: (who: string, john: string) => `${who} missed ${john}`,
  covered: (who: string, whose: string, john: string) => `${who} covered ${whose} ${john}`,
  coveredWord: "Covered",
  disputed: (who: string, whose: string, john: string) => `${who} disputed ${whose} tick on ${john}`,
  struckOut: (whose: string, john: string) => `${whose} ${john} was struck out`,
  stands: (whose: string, john: string) => `${whose} ${john} stands`,
  earnedImmunity: (who: string) => `${who} earned a skip`,
  toppedWeek: (who: string) => `${who} topped the week`,
  skipped: (who: string, john: string) => `${who} skipped ${john}`,
  swapped: (who: string, gave: string, whose: string, took: string) => `${who} swapped ${gave} for ${whose} ${took}`,
  away: (who: string, range: string) => `${who} is away ${range}`,
  youAway: (range: string) => `You’re away ${range}`,
  /** `month` is null for an event that doesn't say which. */
  monthClosed: (month: string | null) => (month ? `${month} is closed` : "The month is closed"),
  /** A payment, to the two people in it: the amount. */
  paidYou: (who: string, amount: string) => `${who} paid you ${amount}`,
  youPaid: (whom: string, amount: string) => `You paid ${whom} ${amount}`,
  /** A payment, to everyone else: only that it was settled. */
  paid: (who: string, whom: string) => `${who} paid ${whom}`,
  // The meta line's words before the time.
  checking: "Checking",
  disputedTick: "Disputed",
  struck: "Struck out",
  onTime: "On time",
  late: "Late",
  /** A miss's meta words: it has no tick to tell about. */
  missedWord: "Missed",
  voted: "The house voted",
  clean: (weeks: number) => `${weeks} clean ${weeks === 1 ? "week" : "weeks"} in a row`,
  swapEarned: "Earned a swap",
  immunityUsed: "Skip used",
  swap: "Swap",
  timeAway: "Time away",
  /** Time away that moved Johns forward: "Time away. 2 Johns due before they go". */
  awayMoved: (due: string) => `Time away. ${due}`,
  dueBefore: (n: number, you: boolean) =>
    `${n} ${n === 1 ? "John" : "Johns"} due before ${you ? "you go" : "they go"}`,
  /** In a family: "Maya joined the family", "New in the family". */
  // An on-call John someone flagged: who flagged it, for whom, and how it went.
  flagged: (by: string, john: string, whom: string) => `${by} flagged ${john} for ${whom}`,
  flaggedOwn: (who: string, john: string) => `${who} flagged ${john}`,
  /** The clock flagged it again after a miss: nobody did. */
  flaggedAgain: (john: string) => `${john} was flagged again after a miss`,
  /** "Ben’s on call", "You’re on call". */
  onCall: (who: string, you: boolean) => (you ? "You’re on call" : `${who}’s on call`),
  /** When it's due: "02:10" today, else "Fri 02:10". */
  dueBy: (onCall: string, when: string) => `${onCall}, due by ${when}`,
  flagDid: (who: string) => `${who} did it`,
  flagTicked: (who: string) => `${who} ticked it`,
  flagMissed: (who: string) => `${who} missed it`,
  flagCovered: "Someone covered it",
  flagWas: (who: string) => `${who} was on call`,
  /** An open flag's chip when it doesn't say when it's due. */
  onCallWord: "Open",
  /** An open flag's chip: how long is left, or how late it is. */
  left: (n: number, unit: "h" | "min") => (unit === "h" ? `${n}h left` : `${n} min left`),
  lateBy: (n: number, unit: "h" | "min") => (unit === "h" ? `${n}h late` : `${n} min late`),
  /** An admin took back or reset someone's move. */
  undid: (by: string, whose: string, what: string) => `${by} undid ${whose} ${what}`,
  sharedOut: "Forfeits split",
  settled: "Settled up",
  // Several in a row by one person, folded into one.
  tickedMany: (who: string, n: number) => `${who} ticked ${n} Johns`,
  missedMany: (who: string, n: number) => `${who} missed ${n} Johns`,
  /** A day's ticks made on time, folded into one row at the day's foot. */
  onTimeMany: (n: number) => `${n} ticked on time`,
  /** Who, under it: "Sam, Jo and you", and past four names "Sam, Jo, Priya, you and 2 more". */
  names: (names: readonly string[]) => {
    const shown = names.length > 4 ? [...names.slice(0, 4), `${names.length - 4} more`] : names;
    return shown.length < 2 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  },
  /** An event's sheet: its meta words, then on a line of their own the day and the time. */
  meta: (detail: string | null, when: string) => (detail ? `${detail}\n${when}` : when),
  /** When, in full, in an event's sheet: "Today, 09:39", "Sat 24 Oct, 18:40". */
  stamp: (day: string, clock: string) => `${day}, ${clock}`,
  /** A row, to a screen reader: the sentence, then its meta line. */
  row: (title: string, detail: string | null, when: string) => (detail ? `${title}, ${detail}, ${when}` : `${title}, ${when}`),
  // Reactions.
  /** The way to all four reactions on a row that has none yet. */
  react: "React",
  /** A reaction and how many gave it, to a screen reader: "Nice one, 2". */
  tally: (label: string, count: number) => `${label}, ${count}`,
  /** A reaction's button in an event's sheet: "Nice one, 2". */
  reactionCount: (label: string, count: number) => (count > 0 ? `${label}, ${count}` : label),
} as const;

/** The front door, starting a house and welcome. */
export const FRONT_DOOR_COPY = {
  /** The front door's three plain sentences, in place of the old feature cards. */
  points: [
    { key: "list", body: "List your house’s chores. We call them Johns." },
    { key: "share", body: "Each week Jonz deals them out fairly." },
    {
      key: "stake",
      body: "Everyone puts in the same each month. Miss a John and part of your stake goes to the ones who did theirs.",
    },
  ],
  start: "Start a house",
  invite: "I’ve got an invite",
  /** Under "Sign in", when the front door's choice came with it. */
  startReason: "Sign in to start your house.",
  inviteReason: "Sign in to use your invite.",
  // Starting a house: one field, and the defaults in one line with Change for the rest.
  name: "Name your house",
  stakeEach: (amount: string) => `${amount} a month each`,
  weekStarts: (day: string) => `weeks start ${day}`,
  change: "Change",
  /** In place of Change while the currency and the week are open. */
  done: "Done",
  changeSpoken: "The currency and the day weeks start",
  zoneNote: (zone: string) => `The time zone is this phone’s, ${zone}. Change it later from House.`,
  submit: "Start the house",
  // Welcome: signed in with no house, the fallback.
  welcome: "Paste the invite someone sent you, or start a house of your own.",
  paste: "Paste your invite link or code",
  pasteHint: "The whole link, or just the eight letters and numbers at its end.",
  badInvite: "That isn’t an invite link or code. Check it against the one you were sent.",
  open: "Open the invite",
  startInstead: "Start a house instead",
  // A join link, signed in.
  join: "Join the house",
  lookingUp: "Looking up the house",
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

/**
 * Bring Jonz to your next house (moving.ts, docs/specs/moving-on.md): your
 * moving-out date, the Moving on screen once you've left, the one reminder,
 * and the prompt for the people who stay. Dates arrive formatted.
 */
export const MOVING_COPY = {
  // House, You, and its page.
  row: "Moving out",
  notPlanned: "Not planned",
  title: "Moving out",
  intro: "Say the day you move out. From then the deal stops giving you Johns, so your last week stays fair, and the house sees the date on the Wall.",
  pick: "The day you move out",
  save: (day: string) => `Moving out ${day}`,
  saved: (day: string) => `You move out on ${day}.`,
  change: "Change the date",
  staying: "I’m staying after all",
  afterward: "When the day comes, leave the house from the foot of House. You can start Jonz in your new place from there.",
  // Today.
  youMoveOut: (day: string) => `You move out on ${day}`,
  movingDay: (house: string) => `Moving day. Leave ${house} from House when you’re ready`,
  // The Wall.
  movesOut: (who: string, day: string) => `${who} ${who === "You" ? "move" : "moves"} out on ${day}`,
  stayingAfterAll: (who: string) => `${who} ${who === "You" ? "are" : "is"} staying after all`,
  movedOut: (who: string) => `${who} moved out`,
  movingDetail: "Moving out",
  // For the people who stay, with the join card.
  askTitle: "Someone moving in?",
  askBody: (house: string) => `Send them the invite, so ${house} keeps going.`,
  askButton: "Send the invite",
  // The Moving on screen: where leaving lands.
  heading: "Moving on",
  body: (house: string, johns: number) =>
    johns > 0
      ? `Start Jonz in your new place with ${house}’s ${johns} ${johns === 1 ? "John" : "Johns"} already on the list, or join a house that’s invited you.`
      : "Start Jonz in your new place, or join a house that’s invited you.",
  start: "Start Jonz in my new place",
  invite: "I have an invite",
  // Starting from the old list.
  newHeading: "Your new place",
  newIntro: (house: string, johns: number) =>
    `${johns} ${johns === 1 ? "John" : "Johns"} from ${house} come with you. Tidy the list in Describe your house before you share the invite.`,
  // The House Pass, when its buyer leaves (it moves with them).
  passComes: (house: string, until: string | null) =>
    until
      ? `Your House Pass comes with you, onto the next house you start or join. ${house} keeps the extras until ${until}.`
      : "Your House Pass comes with you, onto the next house you start or join.",
  leavePass: (house: string) => `Leave it for ${house} instead`,
  passLeft: (house: string) => `You left your House Pass with ${house}. It runs to the end of what you paid, then stops renewing.`,
  // The one reminder, two weeks after leaving.
  reminderTitle: "Settled into your new place?",
  reminderBody: `Bring ${APP_NAME} with you.`,
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

import type { BreakdownKey, RecordCounts, RecordMark, RecordSpan } from "./record";
import { IMMUNITY_EVERY } from "./streak";

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
  newHouse: "Set up your house",
  join: "Join a house",
  today: "Today",
  week: "This week",
  house: "House",
  privacy: "Privacy",
  terms: "Terms",
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
  body: "It wasn’t you. Try again, and if it keeps happening, tell the house admin.",
  retry: "Try again",
  /** Your house couldn't be read, so no screen can be chosen yet. */
  unreachable: "Can’t reach your house",
  unreachableBody: "Check the connection, then try again.",
} as const;

export const FRONT_DOOR = {
  eyebrow: "For houses that share a bin",
  headline: "Jonz: who’s on what this week.",
  signIn: "Sign in",
  start: "Start your house",
  join: "I have a join link",
  points: [
    {
      key: "deal",
      title: "Fair shares, dealt for you",
      body: "Every John has an effort score. Each week the app shares them out so the effort evens up over the month, and the bathroom moves around.",
    },
    {
      key: "stake",
      title: "The Stake",
      body: "Everyone stakes the same each month. Miss a John and part of yours goes to the people who didn’t.",
    },
    {
      key: "wall",
      title: "The Wall and the Table",
      body: "Ticks, photos, disputes and streaks in one feed, and a points table with perks for the top.",
    },
  ],
} as const;

export type FrontDoorPoint = (typeof FRONT_DOOR.points)[number]["key"];

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
  terms: "By continuing you agree to the Terms and the Privacy Policy, and to the house rules your housemates set, and say you’re 13 or older.",
  privacy: "Privacy",
  termsLink: "Terms",
  failed: (provider: SignInProvider) => `${provider} didn’t finish signing you in. Try again.`,
  /** The web came back from Google or Microsoft with an error, and can't tell which. */
  returnFailed: "That sign-in didn’t finish. Try again.",
  signOut: "Sign out",
} as const;

/** Setting up a house: the web's /house/new and the app's. */
export const NEW_HOUSE_COPY = {
  heading: "Set up your house",
  intro: "You’ll be its admin. Next you add the Johns and send the house a join link.",
  name: "What do you call the house?",
  namePlaceholder: "Flat 3",
  currency: "Currency",
  weekStarts: "The week starts on",
  timezone: "Time zone",
  submit: "Set up the house",
  busy: "Setting up…",
  joinInstead: "Joining a housemate’s house instead? Open the join link they sent you.",
} as const;

/** A join link: the web's /join/[code] and the app's. */
export const JOIN_COPY = {
  badLink: "That link doesn’t work",
  /** A mistyped or cut-off code, or a house everyone has left (it closes behind the last one out). */
  badLinkBody: "It may be mistyped, or everyone has left that house. Ask a housemate for the link on their House screen, or start your own.",
  alreadyIn: (house: string) => `You’re already in ${house}`,
  goToJohns: "Go to your Johns",
  otherHouse: "You’re in another house",
  otherHouseBody: "Jonz keeps you in one house at a time. Leave your current one from its House screen first.",
  yourHouse: "Your house",
  invited: "You’re invited",
  livesHere: (people: number) =>
    `${people} ${people === 1 ? "person lives" : "people live"} here. Join and you’re dealt Johns from next week.`,
  join: (house: string) => `Join ${house}`,
  joining: "Joining…",
  back: "Back",
} as const;

/** Signed in with no house: the app's way to start one or join by code. */
export const NO_HOUSE_COPY = {
  heading: "No house yet",
  start: "Start a house",
  code: "Join code",
  badCode: "A join code is eight letters and numbers.",
  join: "Join with this code",
} as const;

/** Today: the week's header and the count of what's left. */
export const TODAY_COPY = {
  title: "Your Johns",
  thisWeek: "This week",
  thisWeekRange: (range: string) => `This week, ${range}`,
  left: (count: number) => (count === 1 ? "John left this week" : "Johns left this week"),
  streak: (weeks: number) => `${weeks} ${weeks === 1 ? "week" : "weeks"}`,
  immunity: (tokens: number) => `${tokens} immunity`,
  swapReady: "swap ready",
  nothingYours: "Nothing on your list this week. Enjoy it while it lasts.",
  toVote: "The house wants your vote",
  yours: "Yours",
  /** On a laptop, the house's week beside yours: the way to Week. */
  seeWeek: "See the week",
} as const;

/** One John, and what its owner can do with it. */
export const JOHN_COPY = {
  photo: "photo",
  markDone: "Mark done",
  /** The laptop board's one small tick. */
  done: "Done",
  ticking: "Ticking…",
  withPhoto: "Mark done with a photo",
  photoAndDone: "Photo and done",
  uploading: "Uploading…",
  photoFailed: "That photo didn’t upload. Try again.",
  undo: "Undo",
  useImmunity: "Use immunity",
  spendIt: "Spend it",
  keepIt: "Keep it",
  standsIn: (when: string) => `Stands ${when} unless someone disputes it.`,
  disputed: (reason: string) => `Disputed: “${reason}”`,
  votes: (uphold: number, reject: number, closes: string) => `${uphold} say not done, ${reject} say fine, closes ${closes}`,
  dueBeforeYouGo: (was: string) => `Due before you go: it was due ${was}, while you’re away.`,
  dueBeforeTheyGo: (owner: string, was: string) => `Due before ${owner} goes: it was due ${was}, while they’re away.`,
} as const;

/** Before there is anything to do this week. */
export const NOT_DEALT_COPY = {
  nothingThisWeek: "Nothing’s been handed out this week.",
  nothingThisWeekBody: "Every John on the list is on a fortnightly or longer cycle, or the list is empty.",
  notYet: "No Johns handed out yet.",
  adminSteps: [
    "Add the house’s Johns, with how much effort each one is.",
    "Send the join link to everyone who lives there.",
    "Hand out the first week. Johns are shared so the effort evens out.",
  ],
  waitingFor: (admin: string) => `${admin} will hand out the first week once the John list is ready.`,
} as const;

/** The join link, ready for the group chat. */
export const INVITE_COPY = {
  heading: "Invite the house",
  body: "Send this link to the group chat. Anyone with it can join after signing in.",
  code: "Code",
  share: "Share",
  copy: "Copy",
  copied: "Link copied",
  shareTitle: (house: string) => `Join ${house} on Jonz`,
  /** Admins only: a fresh code, for when a link has gone somewhere it shouldn't. */
  newCode: "New code",
  newCodeNote: "The old link and code stop working. Removing someone changes the code too.",
} as const;

/** The week's board: everyone's Johns, and where each has got to. */
export const WEEK_COPY = {
  title: "The board",
  done: "Done",
  checking: "Being checked",
  overdue: "Overdue",
  disputed: "Disputed",
  doneOf: (done: number, total: number) => `${done} of ${total}`,
  you: "You",
  everyJohn: "Every John this week",
  columns: { john: "John", who: "Who", due: "Due", points: "Pts", status: "Status" },
  disputes: "Disputes",
  /** A dispute in the laptop's side column, after whose it is ("Ben's", "Your"). */
  disputeOn: (john: string, reason: string) => `${john}: “${reason}”`,
  tally: (uphold: number, reject: number, closes: string) => `${uphold} not done, ${reject} fine, closes ${closes}`,
} as const;

/** Housemate check: disputing a tick, and voting on one. */
export const DISPUTE_COPY = {
  open: "Dispute",
  title: (john: string) => `Was ${john} really done?`,
  body: (owner: string) => `${owner}’s tick goes to a house vote. If the house agrees with you, the John opens again.`,
  label: "What’s wrong with it",
  placeholder: "The hob’s still greasy",
  send: "Put it to the house",
  sending: "Sending…",
  fine: "It’s fine",
  notDone: "Not done",
} as const;

/** A swap token: one of your open Johns for a housemate's. */
export const SWAP_COPY = {
  open: "Use your swap",
  title: "Swap a John",
  body: "You topped the table, so you pick. They get yours, you get theirs.",
  give: "Give away",
  take: "Take instead",
  swap: "Swap them",
  swapping: "Swapping…",
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
  housemates: (count: number) => `${count} ${count === 1 ? "housemate" : "housemates"}`,
  close: "Close",
  standing: (streak: number, tokens: number) => `${streak}-week streak, ${tokens} ${tokens === 1 ? "token" : "tokens"}`,
} as const;

const waitingForYourVote = (count: number) => `${count} waiting for your vote`;

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
  /** A tab's spoken name, with its badge when it has one: "Today, 1 waiting for your vote". */
  tab: (label: string, toVote: number) => (toVote > 0 ? `${label}, ${waitingForYourVote(toVote)}` : label),
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
  formerHousemate: "A former housemate",
} as const;

/** The Table: effort points for the week and the month, fair shares, streaks and perks. */
export const TABLE_COPY = {
  eyebrow: "Effort points",
  title: "The Table",
  thisWeek: "This week",
  beside: "The Table, this week",
  full: "Full table",
  /** A housemate's week or month in a line: "3 done, 1 late, 1 missed". */
  record: (r: { done: number; late: number; missed: number; covered?: number }) =>
    `${r.done} done${r.late ? `, ${r.late} late` : ""}${r.missed ? `, ${r.missed} missed` : ""}${r.covered ? `, ${r.covered} covered` : ""}`,
  shares: "Fair shares",
  sharesBody:
    "What each of you has done since you joined, against your share. A missed John comes back to whoever missed it, and covering for someone counts as yours. Each deal hands a little more to whoever is behind, never more than half a week extra, until it evens out.",
  sharesKey: "Below zero is behind, above is ahead. Time away is made up:",
  streaks: "Streaks and perks",
  weeks: (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`,
  swap: "swap",
  rules: [
    { term: "Points", body: "A John done on time earns its points. A late one earns half. A missed one earns nothing." },
    {
      term: "Immunity",
      body: `Every ${IMMUNITY_EVERY} clean weeks in a row earns a token (hold up to two). Spend one to skip a John with no forfeit.`,
    },
    { term: "Swap", body: "Top the week and you can trade one of your open Johns for anyone’s, once." },
  ],
  yourShare: "Your share, lately",
  everyones: "Everyone’s",
  /** Where you stand against your share, in a sentence. */
  shareLine: (balance: number, weeksToEven: number) =>
    balance <= -0.5
      ? `Points behind your share. The next weeks hand you a little extra, never more than half a week’s worth, for about ${weeksToEven} ${weeksToEven === 1 ? "week" : "weeks"}.`
      : balance >= 0.5
        ? "Points ahead of your share, so the next weeks go a little easier on you."
        : "You’ve done your share.",
} as const;

/** The Stake: this month so far, settling up, and the ledger. Money arrives already formatted. */
export const STAKE_COPY = {
  title: "The Stake",
  eyebrow: (stake: string) => `${stake} each, every month`,
  soFar: (month: string) => `${month} so far`,
  soFarBody: (late: string, missed: string) =>
    `Late costs ${late}, missed costs ${missed}, and nobody loses more than their stake. What’s forfeited is shared among everyone else when the month ends.`,
  columns: { who: "Housemate", forfeited: "Forfeited", share: "Share", ifNow: "If it ended now" },
  capped: "capped",
  settleUp: "Settle up",
  settleBody: "From closed months. Pay however the house pays each other, then whoever was paid marks it received.",
  square: "Everyone’s square.",
  pays: "pays",
  markReceived: "Mark received",
  saving: "Saving…",
  ledger: "The ledger",
  ledgerEmpty: "Nothing yet. Forfeits appear as Johns are settled.",
  ledgerColumns: { month: "Month", who: "Who", what: "What", amount: "Amount" },
  kind: {
    forfeit: "Forfeit",
    cap_refund: "Over the stake, returned",
    share: "Share of the month’s forfeits",
    payment: "Payment",
  } as Record<string, string>,
  /** A payment's other side: "to Ben" for the one who paid, "from Ava" for the one paid. */
  counterparty: (amountMinor: number, name: string) => `${amountMinor > 0 ? "to" : "from"} ${name}`,
  yours: "Your stake this month",
  forfeitedSoFar: (forfeited: string | null) => (forfeited ? `${forfeited} forfeited so far.` : "Nothing forfeited so far."),
  ifNow: "If the month ended now:",
} as const;

/** House: the John list and the deal, the house rules, who lives here, and you. */
export const HOUSE_COPY = {
  eyebrow: "Settings",
  johns: "The John list",
  rules: "House rules",
  members: "Who lives here",
  you: "You",
} as const;

const EVERY: Record<number, string> = { 1: "Every week", 2: "Every 2 weeks", 3: "Every 3 weeks", 4: "Every 4 weeks" };

/** The house's list of Johns, and the sheet an admin adds or edits one in. */
export const JOHN_LIST_COPY = {
  empty: "No Johns yet. Start with the ones that cause arguments: bins, the bathroom, the kitchen.",
  every: EVERY,
  /** "Every 2 weeks, due Sun 21:00". */
  when: (everyWeeks: number, day: string, time: string) =>
    `${EVERY[everyWeeks] ?? `Every ${everyWeeks} weeks`}, due ${day.slice(0, 3)} ${time}`,
  needsPhoto: "needs a photo",
  perWeek: (points: number) =>
    `About ${Math.round(points)} points a week across the house. Changes apply from the next deal.`,
  /** On a laptop, before the week's points over the list: "11 Johns." */
  count: (n: number) => `${n} ${n === 1 ? "John" : "Johns"}.`,
  add: "Add a John",
  edit: (name: string) => `Edit ${name}`,
  hint: "Points are effort: 1 for taking the bins out, 5 for a deep clean, up to 20 for a whole day’s job.",
  name: "Name",
  namePlaceholder: "Bathroom clean",
  kind: "Kind",
  sharedBy: "Shared by",
  everyone: "Everyone",
  noGroups: "For a John only some of you share, like one of two bathrooms, make a group first.",
  groupOnly: "Only that group is handed it, and it only counts toward their share.",
  effort: "Effort",
  effortPoints: "Effort points",
  often: "How often",
  due: "Due",
  by: "By",
  photo: "Needs a photo",
  photoHint: "The tick only counts with a photo of the result.",
  whenLabel: "When",
  onADay: "On a day",
  onCall: "On call",
  onCallHint: "Someone is on call for the week. Anyone can flag it when it needs doing, and they have a set time to do it.",
  respond: "Do it within",
  respondHours: (hours: number) => (hours === 1 ? "1 hour" : `${hours} hours`),
  timesAWeek: "About how often",
  timesAWeekHint: "Only used to deal it fairly. Every time it’s flagged counts.",
  perWeekLabel: (n: number) => (n === 1 ? "Once a week" : `${n} times a week`),
  /** "On call, within 12 hours, about 3 times a week". */
  onCallWhen: (hours: number, perWeek: number) =>
    `On call, within ${hours === 1 ? "1 hour" : `${hours} hours`}, about ${perWeek === 1 ? "once" : `${perWeek} times`} a week`,
  save: "Save",
  create: "Add John",
  saving: "Saving…",
  remove: "Remove",
} as const;

/**
 * How often a John comes round, as the John editor's sentence says it ("Every
 * [3 months] from [November], on the [first] [Saturday] by [21:00]"), the
 * sheets each word opens, and Week's "Coming up".
 */
export const REPEAT_COPY = {
  twiceAYear: "Twice a year",
  /** Which of its weekday in the month: 5 is the last. */
  places: { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "last" } as Record<number, string>,
  /** The editor's switch between the two ways a John comes round. */
  timing: "When",
  onSchedule: "On a schedule",
  // The sentence, around its words.
  every: "Every",
  on: "on",
  onThe: "on the",
  by: "by",
  /** Before the month a John that repeats every few months starts in: "from [November]", "in [March]" for a yearly one. */
  from: "from",
  in: "in",
  onCallUpTo: "On call, up to",
  aWeekWithin: "a week, done within",
  /** A word in the sentence, spoken: "How often: 3 months. Change". */
  word: (what: string, value: string) => `${what}: ${value}. Change`,
  /** "2 times", "once": the on-call sentence's word. */
  times: (n: number) => (n === 1 ? "once" : `${n} times`),
  // The sheets the words open.
  often: "How often",
  anyPeriod: "Or any period",
  units: { weeks: "Weeks", months: "Months", years: "Years" },
  fewer: "Fewer",
  more: "More",
  /** "Which Saturday". */
  which: (day: string) => `Which ${day}`,
  whichSub: "of the month it lands in",
  day: "Which day",
  time: "By what time",
  anyTime: "Or any time",
  startsIn: "Starting in",
  startsInSub: "The first month it lands in. It then comes round from there.",
  timesAWeek: "Up to how many times a week",
  timesAWeekSub: "The deal counts it this many times, so it’s handed out fairly.",
  within: "Done within",
  withinSub: "of someone tapping Needs doing",
  done: "Done",
  /** Under the sentence: "Next: Sat 7 Nov, then 6 Feb, 1 May, 7 Aug". */
  next: (first: string, rest: readonly string[]) => (rest.length ? `Next: ${first}, then ${rest.join(", ")}` : `Next: ${first}`),
  /** Under the time sheet: when it turns late and missed. */
  lateAfter: (hours: number) => `Late after this. Missed ${hours === 1 ? "an hour" : `${hours} hours`} later.`,
  /** The quick picks at the top of How often, in the order they show. */
  quick: [
    { label: "Every week", everyWeeks: 1, everyMonths: null },
    { label: "Every 2 weeks", everyWeeks: 2, everyMonths: null },
    { label: "Monthly", everyWeeks: 1, everyMonths: 1 },
    { label: "Every 3 months", everyWeeks: 1, everyMonths: 3 },
    { label: "Twice a year", everyWeeks: 1, everyMonths: 6 },
    { label: "Yearly", everyWeeks: 1, everyMonths: 12 },
  ] as readonly { label: string; everyWeeks: number; everyMonths: number | null }[],
  /** The time sheet's quick picks. */
  clock: [
    { label: "Morning", time: "09:00" },
    { label: "Midday", time: "12:00" },
    { label: "Evening", time: "18:00" },
    { label: "Night", time: "21:00" },
  ] as readonly { label: string; time: string }[],
  // Week's Johns that come round every few weeks or months, before they're dealt.
  comingUp: "Coming up",
  comingUpNote: "Dealt each week as it comes",
  /** A coming-up row's meta line: "Sat 7 Nov, every 3 months". */
  comingUpWhen: (date: string, often: string) => `${date}, ${often.toLocaleLowerCase()}`,
} as const;

/** On-call Johns on Today, the John sheet and Week: who has them, and flagging them. */
export const ON_CALL_COPY = {
  section: "On call",
  needsDoing: "Needs doing",
  flagging: "Flagging…",
  tookItOut: "Done it",
  youreOnCall: "You’re on call",
  /** A Done it, for ten minutes after: "You did it at 00:42". The mark beside it says Done. */
  didIt: (time: string) => `You did it at ${time}`,
  done: "Done",
  /** On an open flag's sheet, for whoever raised it or an admin. */
  removeBody: (holder: string) => `Flagged by mistake? Take it down and ${holder} won’t be asked again.`,
  removeBodyYours: "Flagged by mistake? Take it down and it won’t need doing.",
  removeFlag: "Remove flag",
  removing: "Removing…",
  removed: "Flag removed.",
  /** On a flag someone else raised, for whoever has it. */
  onlyRaiser: (name: string) => `${name} raised this flag, so only ${name} or an admin can take it down.`,
  onlyAdmin: "Jonz opened this again after a miss, so only an admin can take it down.",
  /** "Alex is on call". */
  holder: (name: string) => `${name} is on call`,
  /** "Flagged by Sam, due 9am": the John sheet's and Today's meta line. */
  flaggedBy: (name: string) => `Flagged by ${name}`,
  flaggedAgain: "Still needs doing after a miss",
  /** A row's meta line: "Bins, flagged by Sam, today 21:00". */
  flaggedByInline: (name: string) => `flagged by ${name}`,
  flaggedAgainInline: "open again after a miss",
  /** "Flagged, with Alex": what a housemate sees once it's flagged. */
  flagged: (name: string) => `Flagged, with ${name}`,
  flaggedYou: "Flagged, with you",
  /** "3 times this week". */
  times: (n: number) => (n === 0 ? "Not yet this week" : n === 1 ? "Once this week" : `${n} times this week`),
  /** The Week screen's line under someone: "On call: Bins". */
  weekLine: (names: readonly string[]) => `On call: ${names.join(", ")}`,
  lastWeek: "From last week",
  /** The week's push lists it as "Bins (on call)". */
  dealtAs: (john: string) => `${john} (on call)`,
  pushTitle: (john: string) => `${john} needs doing`,
  /** "Sam flagged it. Due today 21:00." */
  pushBody: (by: string, due: string) => `${by} flagged it. Due ${due}.`,
  pushAgainBody: (due: string) => `It still needs doing. Due ${due}.`,
} as const;

/** Handing out the week: the first time it starts the house; afterwards it re-deals an unticked week. */
export const DEAL_COPY = {
  first: "Hand out this week’s Johns",
  again: "Re-deal this week",
  dealing: "Dealing…",
  firstBody: "When the list is ready and the house has joined, hand out the first week.",
  againBody: "Re-deal this week to include new Johns or housemates. Only works while nothing this week has been ticked.",
  openHouse: "Open House",
} as const;

/** The house rules. Admins change them; everyone else reads them. Symbols arrive with the currency. */
export const RULES_COPY = {
  name: "House name",
  timezone: "Time zone",
  timezoneHint: "Weeks and due times follow the house’s time zone, wherever each of you is.",
  phoneZone: (zone: string) => `Use this phone’s: ${zone.replaceAll("_", " ")}`,
  weekStarts: "Week starts",
  currency: "Currency",
  stake: (symbol: string) => `Monthly stake (${symbol})`,
  late: (symbol: string) => `Late forfeit (${symbol})`,
  missed: (symbol: string) => `Missed forfeit (${symbol})`,
  disputes: "Disputes can be raised for",
  disputeHours: (hours: number) => (hours === 0 ? "No disputes (honour system)" : `${hours} hours after a tick`),
  /** How long an overdue John can still be done late, as an option. */
  lateHours: (hours: number) => `${hours} hours after it’s due, then it’s missed`,
  /** The grace before anyone else can cover an overdue John, as an option. */
  coverGrace: (hours: number) =>
    hours === 0 ? "No grace: anyone can cover it once it’s due" : `${hours} ${hours === 1 ? "hour" : "hours"} after it’s due`,
  away: "Time away is made up",
  awayNote: "Nobody is handed a John due while they’re away.",
  /** Where the house settles up at month end (houses.settle_in), as options. */
  settleIn: "Settle up",
  settleInOption: { jonz: "In Jonz: mark money received", splitwise: "In Splitwise: add what’s owed there" } as Record<string, string>,
  makeupHint: {
    100: "Their share still counts, so they do a little extra each week when they’re back until it evens out.",
    50: "Half their share still counts and is made up when they’re back; the rest falls to whoever is home.",
    0: "Their share falls to whoever is home, and there’s nothing to make up.",
  } as Record<number, string>,
  badAmount: "Amounts are numbers like 20 or 2.50.",
  check: "Check the settings and try again.",
  save: "Save house rules",
  saving: "Saving…",
  saved: "Saved",
  adminsOnly: "Only admins can change the house rules.",
} as const;

/** Who lives here, and what an admin can do about it. */
export const MEMBERS_COPY = {
  admin: "Admin",
  housemate: "Housemate",
  you: "(you)",
  makeAdmin: "Make admin",
  makeHousemate: "Make housemate",
  remove: "Remove",
  /** The second tap, which means it: "Remove Ben". */
  removeName: (name: string) => `Remove ${name.split(" ")[0]}`,
  cancel: "Cancel",
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

/** Reminders on this device: a browser's push notifications. */
export const REMINDERS_COPY = {
  on: "Remind me on this device",
  off: "Turn reminders off on this device",
  unsupported: "Reminders need a browser that supports notifications. On iPhone, add Jonz to your home screen first.",
  blocked: "Notifications are blocked for this site in your browser settings.",
  failed: "Couldn’t turn reminders on. Try again.",
  turnedOn: "Reminders on for this device",
} as const;

/** What the pushes say, their buttons, and the settings for them. */
export const NOTIFY_COPY = {
  dueTomorrowTitle: (john: string) => `${john} is due tomorrow`,
  dueSoonTitle: (john: string) => `${john} is due soon`,
  dueTomorrowBody: (due: string) => `Due ${due}. Tick it here when it’s done.`,
  dueSoonBody: (due: string) => `Due ${due}. A few hours left to do it on time.`,
  /** Plan it: the reminder at the time you planned. */
  plannedTitle: (john: string) => `Time for ${john}`,
  plannedBody: (due: string) => `You planned it for now. Due ${due}.`,
  needsPhoto: "It needs a photo, so tick it in the app.",
  dealTitle: "This week’s Johns",
  disputedTitle: (john: string) => `Your ${john} tick is disputed`,
  voteTitle: (john: string) => `Vote: was ${john} really done?`,
  // The buttons. Short: a phone shows a few words at most.
  done: "Done",
  held: "It was done",
  struck: "It wasn’t",
  // What the notification says once a button worked.
  ticked: (john: string) => `${john} ticked`,
  tickedBody: "The house can check it now.",
  alreadyTicked: (john: string) => `${john} was already ticked`,
  voted: (john: string) => `Vote counted on ${john}`,
  votedHeld: "You said it was done.",
  votedStruck: "You said it wasn’t done.",
  // Settings.
  settings: "What to send",
  kinds: {
    reminders: "Johns due soon",
    checks: "Housemate checks",
    flags: "On-call flags",
    deal: "The week’s deal",
  },
  kindHints: {
    reminders: "The day before and a few hours before. Tick from the notification.",
    checks: "A tick of yours disputed, or a vote for you to answer.",
    flags: "When a housemate flags an on-call John you have.",
    deal: "Your Johns, when the week is handed out.",
  },
  quiet: "Quiet hours",
  quietHint: "Reminders wait until morning. Anything else arrives without a sound.",
  on: "On",
  off: "Off",
  /** The quiet hours on offer, from and until, on the hour. */
  quietOptions: [
    { label: "Off", from: null, until: null },
    { label: "22:00–07:00", from: 22, until: 7 },
    { label: "23:00–08:00", from: 23, until: 8 },
  ],
  saved: "Saved",
  failed: "Couldn’t save that. Try again.",
} as const;

export const ME_COPY = {
  name: "Your name",
  save: "Save",
  saved: "Name saved",
  reminders: "Reminders",
  look: "Look",
  signOut: "Sign out",
  leave: "Leave the house",
  leaveForGood: "Leave the house for good",
  stay: "Stay",
} as const;

/** Groups: the parts of the house only some of you share. */
export const GROUPS_COPY = {
  title: "Groups",
  empty: "For Johns only some of you share, like one of two bathrooms. Everything else stays with the whole house.",
  nobody: "Nobody left in it: its Johns go to everyone.",
  add: "Make a group",
  edit: (name: string) => `Edit ${name}`,
  hint: "Who shares it. Johns you give this group only go to them.",
  name: "Name",
  namePlaceholder: "Upstairs bathroom",
  who: "Who’s in it",
  create: "Make the group",
  save: "Save",
  saving: "Saving…",
  remove: "Delete",
} as const;

/** Time away: the house's calendar, booking your own, and Today's reminder of it. Dates arrive formatted. */
export const AWAY_COPY = {
  title: "Time away",
  nobody: "Nobody’s booked any time away.",
  awayNow: "away now",
  yours: "Your time away",
  howItWorks:
    "Book it before the week is handed out and you won’t be given Johns due while you’re gone. Any you already have become due before you go.",
  from: "First day away",
  to: "Last day away",
  pickFrom: "Tap your first day away.",
  pickTo: "Now tap your last day away.",
  picked: (range: string) => `Away ${range}.`,
  note: "Where (optional)",
  notePlaceholder: "Lisbon",
  book: "Book time away",
  booking: "Booking…",
  /** What booking moved: the one consequence the calendar can't show. */
  moved: (n: number) =>
    `${n} of your Johns ${n === 1 ? "falls" : "fall"} due while you’re away, so ${n === 1 ? "it’s" : "they’re"} now due before you go.`,
  back: "I’m back",
  cancel: "Cancel",
  nextMonth: "Next month",
  today: "Today",
  thisWeek: "Away this week",
  /** Today's banner: when, and what your share does meanwhile (houses.away_makeup). */
  banner: (range: string, now: boolean) => (now ? `You’re away until ${range}.` : `You’re away ${range}.`),
  bannerBody: (makeup: number) =>
    `Nobody hands you a John due while you’re gone${
      makeup > 0
        ? `, but ${makeup === 100 ? "your share" : "half your share"} still counts: you catch up a little each week when you’re back.`
        : "."
    }`,
  change: "Change",
  /** Who's away: a month calendar, each day as dark as how many are away, and a day's sheet. */
  earlierMonth: "Earlier month",
  laterMonth: "Later month",
  /** A day on the calendar, for a screen reader: "Sunday 8 November, 3 away". */
  dayLabel: (day: string, away: number) => `${day}, ${away === 0 ? "everyone home" : `${away} away`}`,
  /** The key under the calendar, one shade at a time: 1, 2, then 3 or more. */
  shade: (away: number) => (away >= 3 ? "3 or more" : `${away} away`),
  tapADay: "Tap a day to see who’s away and who’s home.",
  dayCount: (away: number, home: number) => `${away} away, ${home} home`,
  awayLabel: "Away",
  homeLabel: "Home",
  everyoneHome: "Nobody. Everyone’s home.",
  nobodyHome: "Nobody. Everyone’s away.",
  backOn: (day: string) => `Back ${day}`,
  dayBefore: "Day before",
  dayAfter: "Day after",
} as const;

/** Today: Next up, Needs you, the rest of your week and the standing line; a John's row, here and on Week. */
export const NEXT_UP_COPY = {
  label: "Next up",
  photo: "Photo",
  takePhoto: "Take a photo",
  library: "Library",
  /** The card's way into the John sheet's "If you can't", by what you hold. */
  cant: (immunity: boolean, swap: boolean) =>
    immunity && swap ? "Skip with immunity or swap" : immunity ? "Skip with immunity" : "Swap this John",
  due: (when: string) => `due ${when}`,
  beforeYouGo: "before you go",
  ifLate: (amount: string) => `${amount} if late`,
  ifMissed: (amount: string) => `${amount} if missed`,
  /** An overdue John's cost: what doing it now costs. */
  now: (late: string) => `${late} now`,
  nowOrMissed: (late: string, missed: string) => `${late} now, ${missed} if missed`,
  overdueSince: (when: string) => `Overdue since ${when}`,
  wasDue: (when: string) => `was due ${when}`,
  /** How long a vote has left, short enough for a row: "17h left". */
  left: (time: string) => `${time} left`,
  done: (when: string) => `done ${when}`,
  excused: "skipped with immunity",
  clear: (day: string) => `You’re clear until ${day}`,
  clearBody: "New Johns are dealt then.",
  /** None of yours to do, but a tick of yours is disputed. */
  voting: "The house is voting on your tick",
  votingBody: (john: string) => `If it says ${john} wasn’t done, it’s yours to do again.`,
  nothingYours: "Nothing on your list this week.",
  away: (day: string) => `You’re away until ${day}`,
  /** A trip of yours starting within a fortnight: "You’re away 28–31 Oct". */
  awaySoon: (range: string) => `You’re away ${range}`,
  /** How your share catches up after time away, by houses.away_makeup. */
  awayBody: (makeup: number) =>
    makeup >= 100
      ? "Your share catches up a little each week when you’re back."
      : makeup > 0
        ? "Half your share catches up a little each week when you’re back."
        : "Your share goes to whoever’s home, so there’s nothing to catch up.",
  changeDates: "Change dates",
  setUp: (house: string) => `Set up ${house}`,
  addJohns: "Add your Johns",
  describe: "Describe your house",
  describeMeta: `${APP_NAME} drafts the list for you`,
  onTheList: (count: number) => (count === 0 ? "Nothing on the list yet" : `${count} on the list`),
  invite: "Invite housemates",
  housemates: (count: number) => (count <= 1 ? "Just you so far" : `${count} in the house so far`),
  dealWeek1: "Deal week 1",
  waiting: (admin: string) => `${admin} will deal it soon.`,
  anAdmin: "An admin",
  /** Someone who has left, named mid-sentence. */
  someoneGone: "a former housemate",
  /** A John row's tick box, spoken (on Today and Week alike), when it isn't a tick. */
  stateLabel: {
    open: "Not done",
    checking: "Ticked, being checked",
    done: "Done",
    late: "Done late",
    disputed: "Disputed",
    missed: "Missed",
    excused: "Skipped with immunity",
    covered: "Covered by a housemate",
  },
  needsYou: "Needs you",
  /** A row's meta once a housemate covered it: "covered by Glyn". */
  coveredBy: (name: string) => `covered by ${name}`,
  /** A Needs you row's title for a housemate's overdue John you could cover. */
  coverOn: (owner: string | null, john: string) => (owner ? `Cover ${owner}’s ${john}` : `Cover ${john}`),
  saysNotDone: (name: string) => `${name} says it’s not done`,
  closes: (when: string) => `closes ${when}`,
  closingNow: "closing now",
  /** A Needs you row's title: whose John the vote is on, and which. */
  voteOn: (owner: string | null, john: string) => (owner ? `Vote on ${owner}’s ${john}` : `Vote on ${john}`),
  rest: "The rest of your week",
  tick: (john: string) => `Mark ${john} done`,
  tickWithPhoto: (john: string) => `Take a photo of ${john} and mark it done`,
  undo: (john: string) => `Undo ${john}`,
  joint: (place: string) => `Joint ${place}`,
  thisWeek: (place: string) => `${place} this week`,
  up: (amount: string, month: string) => `up ${amount} in ${month}`,
  down: (amount: string, month: string) => `down ${amount} in ${month}`,
  square: (month: string) => `square in ${month}`,
} as const;

/** The John sheet's states, from yours to settled. */
export const JOHN_SHEET_COPY = {
  /** A flag's cadence on the sheet: it comes round when it's flagged. */
  onCall: "on call",
  every: (weeks: number) => (weeks === 1 ? "every week" : `every ${weeks} weeks`),
  due: (when: string) => `Due ${when}`,
  costs: (late: string, missed: string) => `late costs ${late}, missed ${missed}`,
  lateCosts: (late: string) => `late costs ${late}`,
  missedCosts: (missed: string) => `missed costs ${missed}`,
  addPhoto: "Add a photo and mark done",
  fromLibrary: "From your library",
  cant: "If you can’t",
  skip: "Skip with immunity",
  skipMeta: (tokens: number) => `No forfeit, you have ${tokens}`,
  /** What spending immunity means, before it's spent. */
  skipSentence: (john: string, left: number) =>
    `Skip ${john} this week? No forfeit, and ${left <= 0 ? "your immunity is used up" : `you’ll have ${left} left`}.`,
  skipIt: "Skip it",
  swap: "Swap this John",
  swapMeta: "You topped a week, trade it once",
  swapFor: "Their open Johns",
  swapBody: (john: string) => `Pick one to take instead. They get ${john}.`,
  you: "You",
  at: (time: string) => `at ${time}`,
  yesterdayAt: (time: string) => `yesterday at ${time}`,
  onAt: (day: string, time: string) => `on ${day} at ${time}`,
  ticked: (who: string, when: string) => `${who} ticked this ${when}`,
  standsIn: (when: string) => `stands ${when}`,
  standsSoon: "stands any minute",
  disputedBy: (name: string) => `Disputed by ${name}`,
  byYou: "you",
  /** The vote so far, in the buttons' order: fine, then not done. */
  tally: (fine: number, notDone: number, closes: string) => `${fine} fine, ${notDone} not done, ${closes}`,
  yourTick: "The house is voting on your tick.",
  /** Undoing a tick after its due time, before it's undone. */
  undoTitle: (john: string) => `Undo ${john}?`,
  undoLate: (late: string | null) =>
    `It’s past its due time, so it’s overdue as soon as it’s undone, and ticking it again counts as late${late ? `: ${late}` : ""}.`,
  undoIt: "Undo it",
  voted: "Vote counted. You can change it on Week.",
  theirs: (owner: string) => `It’s ${owner}’s this week.`,
  doneOnTime: (who: string, when: string | null) => `${who} did it on time${when ? `, ${when}` : ""}.`,
  doneLate: (who: string, when: string | null) => `${who} did it late${when ? `, ${when}` : ""}.`,
  excused: (who: string) => `${who} skipped it with immunity, so there’s no forfeit.`,
  missed: "It was missed.",
  /** A cover being checked: "Glyn covered this at 23:04". */
  covered: (who: string, when: string) => `${who} covered this ${when}`,
  /** The sheet's one button on a housemate's John you can cover. */
  coverIt: "I did this",
  coverPhoto: "Take a photo: I did this",
  /** What covering means, before it's done: "Sam hasn’t done it. If you do, it counts as Sam’s miss, and you get 3 pts and £3." */
  coverBody: (owner: string, points: string, money: string | null) =>
    `${owner} hasn’t done it. If you do, it counts as ${owner}’s miss, and you get ${points}${money ? ` and ${money}` : ""}.`,
  /** Overdue, but still inside the house's grace. */
  coverSoon: (owner: string, when: string) => `It’s still ${owner}’s to do. Anyone else can cover it from ${when}.`,
  /** A settled cover: "Glyn did it for Sam on Tue at 23:04, so it counts as Sam’s miss." */
  coveredSettled: (who: string, owner: string, whose: string, when: string | null) =>
    `${who} did it for ${owner}${when ? ` ${when}` : ""}, so it counts as ${whose} miss.`,
  coveredWasDue: (when: string) => `Covered, was due ${when}`,
  your: "your",
} as const;

/**
 * Shared Jonz: "Done by" on the John list, a Together John's row and sheet,
 * and the roll call ("Who did it?") that ticks a John with whoever did it.
 */
export const CREW_COPY = {
  /** The John editor's row, and its choices: 0 is everyone home. */
  doneBy: "Done by",
  choice: (crew: number) => (crew === 0 ? "Everyone home" : crew === 1 ? "One person" : `${crew} people`),
  /** Under the choices, with points per person: "4 pts each, so 12 in all". */
  each: (points: string) => `${points} each`,
  inAll: (each: string, total: string) => `${each} each, so ${total} in all`,
  everyoneEach: (each: string) => `${each} each, for everyone at home that day`,
  hint: "Effort is per person. Whoever does it shares the points, helpers included.",
  /** Week's section of Johns done together. */
  together: "Together",
  /** A Together John's row: "with Sam and Ada". */
  with: (names: string) => `with ${names}`,
  /** The sheet's people, before and after the roll call. */
  onIt: "On it",
  didIt: "Who did it",
  /** Beside someone on a settled roll call. */
  helped: "Helped",
  wasntThere: "Wasn’t there",
  shareOf: (points: string) => `${points}`,
  /** The roll call. */
  title: "Who did it?",
  sub: (total: string) => `${total}, shared by whoever did it`,
  leftOff: (name: string) => `Counts as a miss for ${name}`,
  addHelper: "Add someone who helped",
  pickHelper: "Who helped?",
  noMoreHelpers: "Everyone here is already on it.",
  /** Under the list: "12 pts ÷ 3", "4 pts each". */
  split: (total: string, people: number) => `${total} ÷ ${people}`,
  splitEach: (each: string) => `${each} each`,
  markDone: "Mark done",
  photoDone: "Take a photo and mark done",
  cancel: "Cancel",
  /** A solo John's way into the roll call. */
  withHelp: "Done with help",
  /** You can't leave yourself off: whoever ticks it did it. */
  youDidIt: "You did it",
  /** A place left off, while it's checked: "Glyn ticked it at 14:10 without you". */
  without: (who: string, when: string, whom: string) => `${who} ticked it ${when} without ${whom}`,
  /** A place left off, once that stands. */
  missedAbsent: "Left off the roll call, so it’s a miss.",
  /** Covering a Together John nobody has ticked. */
  coverBody: (owners: string, points: string, money: string | null) =>
    `${owners} haven’t done it. If you do, it counts as a miss for each of them, and you get ${points}${money ? ` and ${money}` : ""}.`,
  /** Why? on a Together John. */
  needs: (n: number) => (n === 0 ? "Everyone home does it." : `Needs ${n}.`),
  furthest: (names: string, one: boolean, home: number) =>
    `${names} ${one ? "was" : "were"} furthest behind of the ${home} home.`,
  allHome: (names: string, home: number) => `${names} were the ${home} at home that day.`,
  /** Why? once the roll call has said who did it. */
  sharedCounts: (names: string, each: string) => `${names} did it, so it counts as ${each} of work each.`,
  absentCounts: (holder: string, whose: string) =>
    `${holder} wasn’t there, so it’s ${whose} miss: the part goes to whoever did it, and the work comes back in the next deals.`,
  /** Pushes. */
  pushAdded: (who: string, john: string, points: string) => `${who} added you to ${john}, +${points}`,
  pushAddedBody: "It counts as your work. If you didn’t help, say so on the John.",
  pushLeftOff: (who: string, john: string) => `${who} ticked ${john} without you`,
  pushLeftOffBody: "That counts as a miss for you. If you were there, dispute it on the John.",
} as const;

/**
 * The John sheet's "Why?": why the deal gave the John to whom it did, how
 * it added up, and what slipping would cost (or, once settled, whose work it
 * counted as). `who` is "You" or a first name; `whose`, "your" or "Ben’s".
 */
export const WHY_COPY = {
  label: "Why?",
  only: (who: string, you: boolean) => `${who} ${you ? "were" : "was"} the only one sharing it who’s home that day.`,
  /** `who` mid-sentence: "you" or a first name. */
  behind: (who: string) => `It goes to whoever is furthest behind their fair share. When it was dealt, that was ${who}.`,
  fewer: (who: string) => `It was level on fair shares, so it went to whoever had fewer Johns this week: ${who}.`,
  draw: (who: string) => `It was level on fair shares and on Johns this week, so it was drawn: ${who}.`,
  flag: "A flag goes to whoever is on call this week, or, if they’re away, to whoever at home has been handed least.",
  /** Furthest behind once whoever did it last time is nudged on: it was close. */
  nudged: (who: string) =>
    `It goes to whoever is furthest behind their fair share, with a small nudge away from whoever did it last time, so Johns move round. That made it ${who}.`,
  /** Someone as far behind or further, passed over: they had it last time. */
  movedOn: (names: string, one: boolean, level: boolean) =>
    `${names} ${one ? "was" : "were"} ${level ? "level" : "further behind"}, but did it last time.`,
  /** Someone further behind it skipped: they'd been handed the most extra a week gives. */
  full: (names: string, one: boolean) =>
    `${names} ${one ? "was" : "were"} further behind, but had already been handed half a week extra, the most one week catches up.`,
  /** The winner had it last time too. */
  again: (who: string, you: boolean) => `${who} did it last time too, but ${you ? "were" : "was"} still furthest behind.`,
  away: (names: string, one: boolean) => `${names} ${one ? "is" : "are"} away that day.`,
  /** It changed hands after the deal. */
  moved: (dealtTo: string, holder: string) => `It was dealt to ${dealtTo}, and came to ${holder} in a swap or while they were away.`,
  /** Before the deal kept its working. */
  unknown: "This one was dealt before Jonz kept its working.",
  /** Steady weeks: a miss came back to whoever missed it. */
  back: (who: string, you: boolean) =>
    you ? "You missed it last time, so it came back to you. A miss counts for nobody." : `${who} missed it last time, so it came back to them. A miss counts for nobody.`,
  /** Steady weeks: their one John this week. `whose` is "yours" or "Ben’s". */
  oneEach: (whose: string) =>
    `Everyone home gets one John of their own before anyone gets a second, and whoever is furthest behind picks first. This one is ${whose}.`,
  /** Steady weeks: the most budget left. `who` mid-sentence. */
  mostRoom: (who: string) => `It went to whoever had the most of this week’s budget left: ${who}.`,
  /** Classic: their turn. `whose` is "your" or "Ben’s". */
  turn: (whose: string) => `The house takes turns in order, and this week it’s ${whose} turn.`,
  /** Classic: whoever's turn it was is away or full. */
  nextInLine: (who: string) =>
    `Whoever’s turn it was is away or has a full week, so the next in line does it: ${who}. Whoever was skipped stays first in line.`,
  /** It waited for room before this. */
  waited: (weeks: number) => `It waited ${weeks === 1 ? "a week" : `${weeks} weeks`} for room in someone’s budget first.`,
  /** It went a little over someone's budget, having waited a week. `whose` is "your" or "Ben’s". */
  stretched: (whose: string) =>
    `Nobody else had room, but it had already waited a week, so it went a little over ${whose} budget rather than wait again.`,
  /** It went back to whoever did it last time, having waited two weeks. */
  againWaited: "It had waited two weeks, so it went back to whoever did it last time rather than wait again.",
  /** Its day: moved off its own day, and why. */
  movedTaken: (who: string, you: boolean) =>
    `It’s on another day than usual because ${who} already ${you ? "have" : "has"} a John on its own day.`,
  movedSuits: (who: string) => `It’s on a day that suits ${who} better.`,
  movedAway: (who: string, you: boolean) => `It’s on another day than usual because ${who} ${you ? "are" : "is"} away on its own day.`,
  movedGone: "It’s on another day than usual because the week was dealt after its own day.",
  addsUp: "How it added up",
  /** Under the rows: what the figures are. */
  key: "Work done over recent weeks against each share, with this week’s Johns dealt before it. Below zero is behind.",
  /** Under the rows, with a budget: what the figures are. */
  keyBudget: "Work done against the house’s average, and how much of this week’s budget each had left before it. Below zero is behind.",
  /** Under the rows, in Classic: what the figures are. */
  keyTurns: "Who was next in line for this John, among those home.",
  /** A row's figure in Classic: "1st in line". */
  inLine: (place: number) => `${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"} in line`,
  /** A row's note with a budget: "2 left", "0.5 left". */
  left: (room: number) => `${Math.max(0, Math.round(room * 10) / 10)} left`,
  dealtIt: "Dealt it",
  hadItLast: "Had it last time",
  handedMost: "Already handed the most extra",
  /** What slipping costs, while it's open. */
  missedBy: (when: string, holder: string) =>
    `If it isn’t done by ${when}, it’s missed. A miss counts for nobody, so the work comes back to ${holder} in the next deals.`,
  coverFrom: (when: string) => `From ${when} a housemate can cover it, and then it counts as their work.`,
  coverNow: "A housemate can cover it now, and then it counts as their work.",
  /** Once done or settled: whose work it counted as. */
  counts: (whose: string) => `It counts as ${whose} work.`,
  coveredCounts: (who: string, whose: string) => `${who} covered it, so it counts as ${whose} work.`,
  missedCounts: (holder: string) => `It was missed, so it counts for nobody: the work comes back to ${holder} in the next deals.`,
  excusedCounts: (whose: string) => `It was let off, so it still counts as ${whose}.`,
  You: "You",
  you: "you",
  your: "your",
  yours: "yours",
  someoneGone: "a former housemate",
} as const;

/** Week: the summary bar, the person groups, the fair-share footer and the menu. */
export const WEEK_SUMMARY_COPY = {
  /** The summary, to a screen reader. */
  soFar: "This week so far",
  /** The week's days and when it ends: "19–25 Oct, ends tonight". */
  range: (days: string, ends: string) => `${days}, ${ends}`,
  endsTonight: "ends tonight",
  endsTomorrow: "ends tomorrow",
  /** The week's last day: "ends Sun". */
  endsOn: (day: string) => `ends ${day}`,
  ended: "ended",
  /** The bar's and the legend's parts, which add up to the week's Johns. */
  parts: { done: "done", checking: "checking", disputed: "disputed", overdue: "overdue", toGo: "to go" },
  /** The bar, spoken: "11 Johns: 5 done, 2 checking, 2 to go". */
  bar: (total: number, parts: readonly string[]) =>
    total === 0 ? "No Johns this week" : `${total} ${total === 1 ? "John" : "Johns"}: ${parts.join(", ")}`,
  /** A legend part, spoken; pressing it shows only those Johns. */
  part: (count: number, label: string) => `${count} ${label}`,
  showOnly: "Shows only these Johns. Press again to show them all.",
  swapReady: "Swap ready",
  /** A person's header: "1 of 3 done, 6 pts", and under it "away 29 Oct–1 Nov". */
  doneOf: (done: number, total: number) => `${done} of ${total} done`,
  away: (days: string) => `away ${days}`,
  awayAllWeek: "away all week",
  /** On a laptop, who's away, under the summary: "Megan is away 28–31 Oct, You’re away all week". */
  isAway: (who: string, note: string, you: boolean) => `${you ? "You’re" : `${who} is`} ${note}`,
  nothing: "Nothing this week.",
  /** After a fold's "Done (2)", in hazard: "1 late". */
  late: (count: number) => `${count} late`,
  /** An open John's tick box that doesn't tick, spoken: Today's word (the client e2e asks for it by this name). */
  notDone: NEXT_UP_COPY.stateLabel.open,
  vote: "Vote",
  voteOn: (john: string) => `Vote on ${john}`,
  // A row's meta line, after the lid dot and the kind.
  beforeTheyGo: (name: string) => `before ${name} goes`,
  byYou: "you",
  someoneGone: "a former housemate",
  /** On a laptop, a John's row to a screen reader: its name, meta, whose, points and status. */
  spokenRow: (parts: readonly string[]) => parts.join(", "),
  /** The footer: the deal's fairness, from the fair shares. Pressed, it explains them. */
  sharesHint: "Shows everyone’s fair share and how the deal evens it out.",
  /** The fair shares sheet's key: "Below zero is behind, above is ahead. Time away is made up: in full." */
  sharesKey: (key: string, makeup: string) => `${key} ${makeup.toLowerCase()}.`,
  fairLevel: "The deal is even: everyone’s on their share.",
  fairClose: "The deal is even: nobody’s more than half a John off their share.",
  fairBehind: (who: string, points: string, you: boolean) =>
    `${you ? "You’re" : `${who} is`} ${points} behind on fair shares, and catching up a little each week.`,
  fairAhead: (who: string, points: string, you: boolean) =>
    `${you ? "You’re" : `${who} is`} ${points} ahead on fair shares; the next deals even it out.`,
  /** The "•••" menu. */
  awayAction: "I’m away…",
  editJohns: "Edit the John list",
  redeal: "Re-deal this week",
  redealTitle: "Re-deal this week?",
  redealBody: "Everyone’s Johns will be dealt again.",
  redealt: "This week’s Johns were dealt again.",
  /** Before the deal. */
  notDealt: "This week hasn’t been dealt yet",
  notDealtBody: "Johns are shared so the effort evens out.",
} as const;

/** House: the month card and settling up, and the Table with its invite and rules sheets. */
export const HOUSE_PAGE_COPY = {
  /** Under the house's name: "4 housemates, £20 a month each". */
  sub: (housemates: number, stake: string) =>
    `${housemates} ${housemates === 1 ? "housemate" : "housemates"}, ${stake} a month each`,
  /** The month card's label: "October so far". */
  soFar: (month: string) => `${month} so far`,
  /** The Lead, before the figure: "You’re up £4.01". */
  up: "You’re up",
  down: "You’re down",
  nothingYet: "Nothing forfeited yet",
  /** Forfeited exactly what came back. */
  even: "You’re even so far",
  forfeited: (amount: string) => `${amount} forfeited`,
  nothingForfeited: "Nothing forfeited",
  sharedOut: (day: string) => `shared out ${day}`,
  /** The meta line when the Lead has already said nothing was forfeited. */
  sharedOutAlone: (day: string) => `Forfeits are shared out ${day}`,
  /**
   * The Overview's row of figures, each a figure over what it counts, and
   * the row's name to a screen reader. Your month: "£4.01" over "you’re up
   * in October", or "£0" over "forfeited in October".
   */
  figures: "The house at a glance",
  upIn: (month: string) => `you’re up in ${month}`,
  downIn: (month: string) => `you’re down in ${month}`,
  forfeitedIn: (month: string) => `forfeited in ${month}`,
  stakeEach: "stake a month each",
  housemates: (n: number) => (n === 1 ? "housemate" : "housemates"),
  johnsListed: (n: number) => (n === 1 ? "John on the list" : "Johns on the list"),
  /** Settling up, on the Overview while anything from a closed month is still to settle. */
  settleUp: "Settle up",
  /** A debt from closed months, with the months it's from when they can be named: "Tom owes you £4.01 for September". */
  owesYou: (name: string, amount: string, months = "") => `${name} owes you ${amount}${months ? ` for ${months}` : ""}`,
  youOwe: (name: string, amount: string, months = "") => `You owe ${name} ${amount}${months ? ` for ${months}` : ""}`,
  /** What happens next, on the meta line: owed to you, it's paid however you like; yours, it waits on them. */
  paidHowYouLike: "Paid however you like",
  /** Two or more months in a row of words: "August and September". */
  and: "and",
  waitingFor: (name: string) => `Waiting for ${name} to confirm`,
  /** A settle-up with someone who has left: the database only lets a housemate's payment be marked. */
  gone: "They’ve left, so it can’t be marked here",
  /** Someone who has left, mid-sentence: "You owe a former housemate £2", "Sam paid a former housemate". */
  formerHousemate: "a former housemate",
  markReceived: (amount: string) => `Mark ${amount} received`,
  /** The same button, to a screen reader, which hears it away from its row: "Mark Tom’s £4.01 received". */
  markReceivedFrom: (name: string, amount: string) => `Mark ${name}’s ${amount} received`,
  marking: "Saving…",
  /**
   * A house that settles up in Splitwise (houses.settle_in): what's owed to
   * you is added there by you, as an expense you paid that they owe all of,
   * and marked here so Jonz stops asking for it.
   */
  splitwiseHow: (name: string) => `Add it in Splitwise: paid by you, ${name} owes all of it`,
  /** What you owe, in a Splitwise house: it waits for them to add it. */
  splitwiseWaiting: (name: string) => `${name} adds it to Splitwise`,
  /** The expense's description in Splitwise, with the months it's from when they can be named: "Jonz Stake, October". */
  splitwiseDescription: (months: string) => (months ? `Jonz Stake, ${months}` : "Jonz Stake"),
  addedToSplitwise: "Added to Splitwise",
  /** The same button, to a screen reader: "Mark Tom’s £4.01 added to Splitwise". */
  addedToSplitwiseFrom: (name: string, amount: string) => `Mark ${name}’s ${amount} added to Splitwise`,
  /** Copies the amount alone ("4.01"), which is what Splitwise's amount box takes. */
  copyAmount: (plain: string) => `Copy ${plain}`,
  copyAmountFrom: (name: string, amount: string) => `Copy ${name}’s ${amount}`,
  copied: (plain: string) => `Copied ${plain}.`,
  openSplitwise: "Open Splitwise",
  history: "Stake history",
  stakeUnreadable: "Couldn’t read the Stake. Check the connection.",
  readingStake: "Reading the Stake",
  table: "The Table",
  /** The Table's menu of this week and the month, to a screen reader. */
  show: "Show",
  /** The Table's this week, in its menu and its header ("October" is the other). */
  week: "This week",
  you: "You",
  tableUnreadable: "Couldn’t read the month’s Table. Check the connection.",
  readingTable: "Reading the Table",
  /** Late and missed this month, in a Table row's meta: "7 late, 1 missed". */
  lateMissed: (late: number, missed: number) =>
    [late ? `${late} late` : "", missed ? `${missed} missed` : ""].filter(Boolean).join(", "),
  inMonth: (month: string) => ` in ${month}`,
  /** Housemates' Johns someone covered this month, in a Table row's meta: "2 covered". */
  covered: (n: number) => `${n} covered`,
  streak: (weeks: number) => `${weeks}-week streak`,
  immunity: (tokens: number) => `${tokens} immunity`,
  swap: "swap ready",
  away: (range: string) => `away ${range}`,
  /** Money lost, said with the figure: a screen reader hears it as well as the colour shows it. */
  losing: (amount: string) => `${amount}, losing money`,
  invite: "Invite housemates",
  inviteBody: "Send it to the group chat. Anyone with the link joins once they’ve signed in.",
  code: "Code",
  shareInvite: "Share invite",
  copyLink: "Copy link",
  rules: "How points and the stake work",
  /** The rules sheet's title: short enough for one line on a phone. */
  rulesTitle: "Points and the stake",
  rulesPoints: "Points",
  rulesPointsBody:
    "A John done on time earns its points. A late one earns half, and a missed one earns nothing. The Table adds them up for the week and the month.",
  rulesStake: "The Stake",
  rulesStakeBody: (stake: string, late: string, missed: string) =>
    `Everyone puts in ${stake} a month. A late John costs ${late} and a missed one ${missed}, but nobody loses more than ${stake} in a month. On the 1st, what was forfeited is shared out among everyone else. Jonz never moves money: pay each other however you like, and whoever is paid marks it received.`,
  rulesImmunity: "Immunity",
  rulesImmunityBody: (every: number, cap: number) =>
    `Every ${every} clean weeks in a row earns an immunity token (you can hold ${cap}). Spend one to skip a John with no forfeit.`,
  rulesSwap: "Swap",
  rulesSwapBody: "Top the week and you earn a swap: trade one of your open Johns for a housemate’s open John that week.",
  rulesShares: "Fair shares",
  rulesSharesBody: (makeup: string) =>
    `Johns are dealt so that everyone does their share, counted from the day they joined. What counts is what you did: a missed John comes back to you, and one you cover for someone counts as yours. Whoever is behind is handed a little more, never more than half as much again. Time away is made up ${makeup}.`,
  /** How time away is made up, by the house's setting (houses.away_makeup). */
  makeup: { 100: "in full", 50: "by half", 0: "not at all" } as Record<number, string>,
} as const;

/** A housemate's page. */
/** House › Admins: who looks after the house. */
export const ADMINS_COPY = {
  title: "Admins",
  meta: (admins: number, everyone: number) => `${admins} of ${everyone}`,
  note: "Admins change the list, the rules and who’s in, and fix mistakes. What they change is posted on the Wall.",
  /** You, in the list: "Priya (you)". */
  you: (name: string) => `${name} (you)`,
  add: "Add an admin",
  addTitle: "Add an admin",
  addBody: "They can change the list and the rules, and fix anyone’s mistakes.",
  everyoneIs: "Everyone here is an admin already.",
  make: (name: string) => `Make ${name} admin`,
  remove: "Remove",
  removeLabel: (name: string) => `Remove ${name} as an admin`,
  onlyAdmin: "The only admin can’t step down. Leaving hands the house over.",
} as const;

export const PERSON_COPY = {
  /** Under their name: "Admin", or "You, admin" on your own page. */
  sub: (admin: boolean, you: boolean) => (you ? `You, ${admin ? "admin" : "housemate"}` : admin ? "Admin" : "Housemate"),
  record: "Their record",
  yourRecord: "Your record",
  thisWeek: "This week",
  onTime: (n: number) => `${n} on time`,
  /** Housemates' Johns they covered: "1 covered for others". */
  coveredFor: (n: number) => `${n} covered for others`,
  fairShare: "Fair share",
  /** Points against their share: "3.5 points behind their share". */
  behind: (points: string, you: boolean) => `${points} ${points === "1" ? "point" : "points"} behind ${you ? "your" : "their"} share`,
  ahead: (points: string, you: boolean) => `${points} ${points === "1" ? "point" : "points"} ahead of ${you ? "your" : "their"} share`,
  level: (you: boolean) => `Level with ${you ? "your" : "their"} share`,
  catchingUp: (weeks: number) => `Catching up over about ${weeks} ${weeks === 1 ? "week" : "weeks"}`,
  easier: "The next deals go a little easier",
  sinceJoining: "Since joining",
  streakAndTokens: "Streak and tokens",
  streak: (weeks: number) => `${weeks}-week streak`,
  noStreak: "No streak yet",
  startsStreak: "A clean week starts one",
  nextImmunity: (weeks: number) => `Next immunity token in ${weeks} ${weeks === 1 ? "week" : "weeks"}`,
  fullImmunity: "Holding all the immunity tokens there are",
  immunity: (n: number) => `${n} immunity ${n === 1 ? "token" : "tokens"}`,
  immunityMeta: "Skips a John with no forfeit",
  swap: "Swap ready",
  swapMeta: "Trades an open John for a housemate’s",
  noTokens: "No tokens",
  noTokensMeta: "Clean weeks and topping a week earn them",
  forfeited: "Forfeited",
  capped: (stake: string) => `Capped at the ${stake} stake`,
  noneForfeited: "Nothing late or missed",
  share: "Share of the others’ forfeits",
  sharedOut: (day: string) => `Shared out ${day}`,
  net: "Net so far",
  ifNow: "If the month ended now",
  /** What's owed from closed months between them and you, apart from the month so far. */
  settling: "Settling up",
  away: "Time away",
  awayNow: "Away now",
  booked: "Booked",
  noAway: "No time away booked.",
  readingAway: "Reading time away",
  awayUnreadable: "Couldn’t read time away. Check the connection.",
  admin: "Admin",
  makeAdmin: "Make admin",
  makeAdminMeta: "Can change the rules and the Johns",
  makeHousemate: "Make housemate",
  makeHousemateMeta: "Stops being an admin",
  remove: (name: string) => `Remove ${name} from the house`,
  removeTitle: (name: string) => `Remove ${name} from the house?`,
  removeBody: (name: string) =>
    `${name} won’t be in the house any more. Their history stays on the Wall and in Stake history. The invite code changes, so they’d need a new invite to join again.`,
  removeConfirm: (name: string) => `Remove ${name}`,
} as const;

/** Stake history: the ledger by month. */
export const STAKE_HISTORY_COPY = {
  title: "Stake history",
  /** Under the title, as under the house's name on House: "£20 a month each". */
  sub: (stake: string) => `${stake} a month each`,
  /** Whose entries to show. */
  show: "Show",
  mine: "Mine",
  whole: "Whole house",
  /** A forfeit whose John can't be read any more. */
  aJohn: "A John",
  late: "Late",
  missed: "Missed",
  forfeit: "Forfeit",
  share: "Share of forfeits",
  capRefund: "Over the stake, returned",
  /** An admin's fix to a month already shared out. */
  correction: "Correction",
  correctionOf: (john: string) => `Correction: ${john}`,
  /** Under a month an admin let off. */
  letOff: "Let off",
  /** A payment, from whoever is looking: "You paid Priya", "Tom paid you", "Tom paid Priya". */
  paid: (from: string, to: string) => `${from} paid ${to}`,
  yourself: "you",
  received: (day: string) => `Marked received ${day}`,
  empty: "Nothing yet",
  emptyBody: "Forfeits appear here as Johns are settled, and shares when a month closes.",
  emptyMine: "Nothing of yours yet. Whole house shows everyone’s.",
} as const;

/**
 * The foot of every long list (the Wall, History, the Audit log, and later
 * Houses), the same everywhere: more loads as you near the end, and the foot
 * says how far back you are, that it's reading, or that there's no more.
 */
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
} as const;

/** The whole Wall, by day. */
export const WALL_FEED_COPY = {
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
  earnedImmunity: (who: string) => `${who} earned immunity`,
  toppedWeek: (who: string) => `${who} topped the week`,
  skipped: (who: string, john: string) => `${who} skipped ${john}`,
  swapped: (who: string, gave: string, whose: string, took: string) => `${who} swapped ${gave} for ${whose} ${took}`,
  away: (who: string, range: string) => `${who} is away ${range}`,
  youAway: (range: string) => `You’re away ${range}`,
  joined: (who: string) => `${who} moved in`,
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
  immunityUsed: "Immunity used",
  swap: "Swap",
  timeAway: "Time away",
  /** Time away that moved Johns forward: "Time away. 2 Johns due before they go". */
  awayMoved: (due: string) => `Time away. ${due}`,
  dueBefore: (n: number, you: boolean) =>
    `${n} ${n === 1 ? "John" : "Johns"} due before ${you ? "you go" : "they go"}`,
  newHousemate: "New housemate",
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
  adminFix: "An admin’s fix",
  sharedOut: "The Stake is shared out",
  settled: "Settled up",
  // Several in a row by one person, folded into one.
  tickedMany: (who: string, n: number) => `${who} ticked ${n} Johns`,
  missedMany: (who: string, n: number) => `${who} missed ${n} Johns`,
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

/** House: the Wall's latest, House setup's rows, You, and leaving. */
export const HOUSE_LOWER_COPY = {
  /** House setup's note on the right: changing these changes the house. */
  setupNote: "Affects everyone",
  /** On a laptop, House's pages listed beside the page: its top, and the list's name to a screen reader. */
  overview: "Overview",
  pages: "The house’s pages",
  /** The John list on a laptop: a John's details open beside it, and close from here. */
  closePanel: "Close",
  johns: "Johns",
  rules: "Rules",
  away: "Days and time away",
  groups: "Groups",
  // Each setup row's value.
  noJohns: "None yet",
  johnsValue: (count: number, perWeek: string) => `${count} ${count === 1 ? "John" : "Johns"}, ${perWeek}`,
  perWeek: (points: number) =>
    points < 1 ? "less than 1 pt a week" : `about ${points} ${points === 1 ? "pt" : "pts"} a week`,
  /** `stake` is null for a house that stakes nothing. */
  rulesValue: (stake: string | null, late: string, missed: string) =>
    `${stake ? `${stake} stake` : "No stake"}, ${late} late, ${missed} missed`,
  nobodyAway: "Nobody’s away",
  awayValue: (who: string, range: string) => `${who}, ${range}`,
  noGroups: "None",
  groupsValue: (n: number) => `${n} ${n === 1 ? "group" : "groups"}`,
  // You.
  /** Under your name at the top of the You page: "Elm Street, admin". */
  youIn: (house: string, admin: boolean) => `${house}, ${admin ? "admin" : "housemate"}`,
  /** The Overview's way to the You page on a phone, under your name. */
  youMeta: "Name, look, sign-in and leaving",
  name: "Name",
  rename: "Change your name",
  save: "Save",
  reminders: "Reminders",
  on: "On",
  off: "Off",
  look: "Look",
  signOut: "Sign out",
  // Leaving, and what it costs.
  leave: (house: string) => `Leave ${house}`,
  leaveAsk: (house: string) => `Leave ${house}?`,
  leaveConfirm: "Leave the house",
  loseShare: (amount: string, month: string | null) =>
    `you’ll lose your ${amount} share of ${month ? `${month}’s` : "this month’s"} stake so far`,
  owesYou: (who: string, amount: string) => `${who} still owes you ${amount}`,
  youOwe: (whom: string, amount: string) => `you still owe ${whom} ${amount}`,
  costsNothing: "You’re square with everyone, so it costs you nothing.",
  /** The only admin, with others still in the house: they hand over as they go. */
  lastAdmin: "You’re the only admin. Pick who looks after the house when you go.",
  handOver: (name: string) => `Make ${name} admin and leave`,
  /** The last one out, after what it costs. The house closes behind them: its join link opens nothing. */
  lastOne: "Nobody will be left, and the house’s join link will stop working.",
  /** Until the Stake is read, and if it can't be. */
  costReading: "Working out what leaving costs you…",
  costUnread: "Couldn’t read the Stake, so this can’t say what leaving costs you.",
  /** "a, b, and c": the clauses of what leaving costs. */
  list: (clauses: readonly string[]) =>
    clauses.length < 2 ? clauses.join("") : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`,
  // The foot of House.
  noMoney: "Jonz never moves money.",
  privacy: "Privacy",
  terms: "Terms",
} as const;

/** House setup: the Johns, Rules, Time away and Groups pages. */
export const SETUP_COPY = {
  /** A kind of John as a section of the John list: "Kitchen (3)". */
  kind: (label: string, count: number) => `${label} (${count})`,
  /** In a John's meta line: the tick needs a photo. */
  photo: "photo",
  /** How often, for a gap the list doesn't name. */
  everyWeeks: (weeks: number) => `Every ${weeks} weeks`,
  noJohns: "No Johns yet",
  noJohnsBody: "Start with the ones that cause arguments: bins, the bathroom, the kitchen.",
  /** An empty list, to a housemate who can't add to it: who will. */
  johnsComing: (names: string) => `${names} will add the Johns.`,
  johnsComingAdmin: "An admin will add the Johns.",
  /** The John list's re-deal, asked first. */
  redealTitle: "Re-deal this week?",
  redealBody: "Everyone’s Johns will be dealt again from the list as it is now.",
  redealt: "This week’s Johns were dealt again.",
  /** A John, read by someone who can't change it. */
  kindLabel: "Kind",
  photoLabel: "Photo",
  /** Under "Needs a photo" in the John form, on one line. */
  photoMeta: "A tick only counts with a photo.",
  photoNeeded: "Needed to tick it",
  photoNot: "Not needed",
  /** The house rules, read out. */
  stake: "Stake",
  perMonth: (amount: string) => `${amount} a month`,
  noStake: "None",
  late: "Late John",
  missed: "Missed John",
  nothing: "Nothing",
  disputes: "Disputes",
  disputeWindow: (hours: number) => (hours === 0 ? "Not allowed" : `within ${hours} ${hours === 1 ? "hour" : "hours"}`),
  /** How long a tick can be disputed, as a value in the form: "24 hours". */
  disputeShort: (hours: number) => (hours === 0 ? "None" : `${hours} ${hours === 1 ? "hour" : "hours"}`),
  lateWindow: "Done late",
  /** How long an overdue John can still be done late, as the rules read: "up to 24 hours after it’s due". */
  lateFor: (hours: number) => `up to ${hours} ${hours === 1 ? "hour" : "hours"} after it’s due`,
  lateShort: (hours: number) => `${hours} ${hours === 1 ? "hour" : "hours"}`,
  cover: "Covering",
  /** When a housemate can cover an overdue John, as the rules read: "3 hours after it’s due". */
  coverWindow: (hours: number) => (hours === 0 ? "As soon as it’s due" : `${hours} ${hours === 1 ? "hour" : "hours"} after it’s due`),
  coverShort: (hours: number) => (hours === 0 ? "None" : `${hours} ${hours === 1 ? "hour" : "hours"}`),
  away: "Time away",
  makeup: { 100: "made up in full", 50: "half made up", 0: "not made up" } as Record<number, string>,
  /** A make-up rate the house has no words for. */
  makeupPercent: (percent: number) => `${percent}% made up`,
  /** Where the house settles up (houses.settle_in), on the rules page. */
  settleIn: "Settle up",
  settleInValue: { jonz: "In Jonz", splitwise: "In Splitwise" } as Record<string, string>,
  weekStarts: "Weeks start",
  weekStartsAt: (day: string, place: string) => `${day}, ${place} time`,
  you: "You",
  /** The last two names in a list: "Sam, Priya and Tom". */
  and: "and",
  /** The rules' read-out, with Edit beside it for an admin. */
  rules: "Rules",
  /** Under the rules: who can change them. */
  canChange: (names: string, count: number) => `${names} (${count === 1 ? "admin" : "admins"}) can change these.`,
  youCanChange: "You can change these.",
  adminsNobody: "Only admins can change these.",
  edit: "Edit",
  /** The rules form's three sections. */
  money: "Money",
  fairness: "Fairness",
  house: "House",
  cancel: "Cancel",
  saved: "House rules saved",
  /** Time away. */
  whosAway: "Who’s away",
  awayNow: "Away now",
  /** The booking calendar's way back and on, a few weeks at a time. */
  earlier: "Earlier weeks",
  later: "Later weeks",
  book: "Book",
  /** Groups. */
  noGroups: "No groups yet",
  addGroup: "Add a group",
  groupsNote: "A John that belongs to a group is only handed to the people in it.",
} as const;

/** The front door, starting a house and welcome. */
export const FRONT_DOOR_COPY = {
  /** The front door's three plain sentences, in place of the old feature cards. */
  points: [
    { key: "list", body: "List your house’s chores. We call them Johns." },
    { key: "share", body: "Each week the app shares them out fairly." },
    {
      key: "stake",
      body: "Everyone puts in the same each month. Miss a John and your share goes to the ones who did theirs.",
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
  welcome: "Paste the invite a housemate sent you, or start a house of your own.",
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
  privacy: "What you write is sent to Anthropic’s Claude, through Vercel, to draft the list.",
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
  /** The card's label, and its line: the house's points a week before and after. */
  changesLabel: "Changes",
  changesMeta: (before: number, after: number) => (before === after ? `${after} pts a week` : `${before} → ${after} pts a week`),
  /** Each change's kind, before what it says about the John. */
  adding: "New",
  removing: "Taking off",
  apply: (n: number) => (n === 0 ? "Pick at least one change" : n === 1 ? "Apply 1 change" : `Apply ${n} changes`),
  applying: "Applying…",
  applied: (n: number) => (n === 1 ? "1 change made" : `${n} changes made`),
  appliedMeta: "From the next deal",
  /** In place of the message box, for a house without the Pass. */
  passNeeded: `Changing your list with ${APP_NAME} comes with the House Pass. Setting up a new house stays free.`,
  seePass: "See the House Pass",
} as const;

/**
 * The House Pass: one per house, bought by anyone in it, for everyone in it.
 * The sentences on its row on House and on its page.
 */
export const PASS_COPY = {
  title: "House Pass",
  /** Its section on House, and the note on the right. */
  section: "House Pass",
  sectionNote: "For everyone here",
  // The row's value (pass.ts passLine).
  founding: "Founding house",
  trialLeft: (days: number) => `Free month, ${days} ${days === 1 ? "day" : "days"} left`,
  trialEnded: "Free month ended",
  renews: (plan: string, day: string) => `${plan}, renews ${day}`,
  ended: (day: string) => `Ended ${day}`,
  // The page.
  lead: "One Pass covers the whole house. Anyone can buy it, and everyone gets the extras.",
  foundingLead: `Your house has the House Pass for life, as one of the first houses on ${APP_NAME}. Thank you.`,
  boughtBy: (name: string) => `Bought by ${name}`,
  includes: "What the house gets",
  stake: "The Stake",
  stakeMeta: "Forfeits for late and missed Johns, shared out each month",
  table: "The Table and perks",
  tableMeta: "Points, streaks, immunity and swaps",
  photos: "Photo receipts",
  photosMeta: "A photo with a tick, for the Johns that need one",
  history: "All your history",
  historyMeta: (weeks: number) => `Every week, not just the last ${weeks}`,
  plans: "Plans",
  yearly: "Yearly",
  monthly: "Monthly",
  foundingPlan: "Founding house",
  perYear: (price: string) => `${price} a year`,
  perMonth: (price: string) => `${price} a month`,
  once: (price: string) => `${price} once`,
  perMonthish: (price: string) => `About ${price} a month`,
  monthlyMeta: "Stop any time",
  foundingMeta: "The Pass for life, for houses that start at launch",
  /** Until the stores are set up there is nothing to press. */
  buyingSoon: "Buying opens with the app store release. Until then every house keeps everything.",
  /** Under the plans during the free month, when Stripe can put the first charge off. */
  firstCharge: (day: string) => `Nothing to pay until your free month ends on ${day}.`,
  /** Back from Stripe Checkout, before the webhook has landed. */
  bought: "Thanks for buying the House Pass. It shows here in a moment.",
  manage: "Manage plan",
  manageMeta: "Change plan, change card or cancel",
  // The API's refusals.
  checkoutClosed: "Buying the House Pass isn’t open yet.",
  alreadyFounding: "This house has the House Pass for life already.",
  alreadyPaid: "This house has the House Pass already. Whoever bought it can change the plan from Manage plan.",
  notBuyer: "Only the housemate who bought the House Pass can change it.",
  nothingToManage: "There’s no plan to manage yet.",
  free: "Free for every house, always: the deal, the housemate check, reminders, covering and time away. No ads.",
  /** Under the plans: what the Pass pays for, said plainly. */
  money: `Where the money goes: the servers, the AI, card and app store fees, and the time it takes one person to keep ${APP_NAME} going. No investors, no ads.`,
  /** For a house whose free month or plan has ended and can't pay: the Pass for free, by email. */
  hardship: "Money tight? Ask and we’ll give your house the Pass for free.",
  askFree: "Ask for a free Pass",
  /** The email that link starts. */
  askFreeSubject: "Free House Pass",
  /** Under the plans while they're on sale: how renewing works, and the terms that say so. */
  renewal: "Yearly and monthly plans renew until you cancel, and you can cancel any time.",
  terms: "House Pass terms",
  /** Where a locked extra was, once the Pass is enforced. */
  locked: (feature: string) => `${feature} comes with the House Pass`,
  unlock: "See the House Pass",
} as const;

/** The track record, opened from Week: the grid, and one person's breakdown. */
export const RECORD_COPY = {
  title: "Track record",
  /** The key's line for the amber dot. */
  changed: "Changed by an admin",
  /** Week's way in. */
  open: "Track record",
  intro: "One square per week. A streak, or a slide, shows at a glance.",
  introWeek: "One square per John this week.",
  span: "Show",
  spans: { week: "Week", month: "Month", year: "Year", all: "All" } as Record<RecordSpan, string>,
  nothingYet: "Nothing dealt yet",
  yearRange: (year: string, weeks: number) => `${year}, ${weeks} ${weeks === 1 ? "week" : "weeks"}`,
  allRange: (since: string, weeks: number) => `Since ${since}, ${weeks} ${weeks === 1 ? "week" : "weeks"}`,
  onTime: "On time",
  /** A row's figure: "94%", or a dash with nothing settled. */
  pct: (pct: number | null) => (pct === null ? "–" : `${pct}%`),
  /** A row's meta: "6 on time, 1 late, 1 missed, covered 2". */
  counts: (c: RecordCounts) =>
    [
      `${c.onTime} on time`,
      c.late ? `${c.late} late` : null,
      c.missed ? `${c.missed} missed` : null,
      c.skipped ? `${c.skipped} skipped` : null,
      c.covered ? `covered ${c.covered}` : null,
      c.helped ? `helped ${c.helped}` : null,
    ]
      .filter(Boolean)
      .join(", "),
  you: (name: string) => `${name} (you)`,
  key: "Key",
  marks: {
    clean: "All on time",
    late: "Something late",
    missed: "Something missed",
    covered: "Covered for someone",
    skipped: "Skipped",
    open: "Not done yet",
    away: "Away",
    none: "Nothing dealt",
  } as Record<RecordMark, string>,
  /** A square, spoken: "Week of 6 Oct: all on time". */
  cellLabel: (when: string, mark: RecordMark) => `${when}: ${RECORD_COPY.marks[mark].toLowerCase()}`,
  /** The person's page. */
  personTitle: (name: string) => name,
  whereFrom: "Where it comes from",
  lines: {
    share: "Their share",
    onTime: "Done on time",
    late: "Done late",
    skipped: "Skipped",
    open: "Still to do",
    missed: "Missed",
    covered: "Covered for others",
    helped: "Helped",
  } as Record<BreakdownKey, string>,
  yourShare: "Your share",
  /** Under the share: what it is. */
  shareMeta: (weeks: number) => `A part of every John they share, over ${weeks} ${weeks === 1 ? "week" : "weeks"}`,
  lineMeta: (johns: number) => `${johns} ${johns === 1 ? "John" : "Johns"}`,
  missedMeta: "A miss counts for nobody",
  openMeta: "Counts as theirs until it’s done or missed",
  coveredIt: (name: string) => `${name} covered it`,
  coveredFor: (name: string) => `for ${name}`,
  /** A John done together: "with Sam and Mo"; one they helped with: "with Glyn". */
  doneWith: (names: string) => `with ${names}`,
  leftOff: "left off the roll call",
  total: (name: string) => `${name}, this span`,
  totalYou: "You, this span",
  /** The breakdown's last word: what the deal does about it, over the weeks it remembers. */
  next: "What happens next",
  someoneGone: "A former housemate",
} as const;

/** Budgets' names: Light, Usual and Busy. */
const BUDGET_WORD: Record<number, string> = { 2: "Light", 4: "Usual", 6: "Busy" };

/**
 * Steady weeks (steady.ts): how the house shares Johns and its budget, Keep
 * its day, each person's preferences, Plan it, Johns waiting their turn, and
 * the swap offered for a John you'd rather not do.
 */
export const STEADY_COPY = {
  /** House rules. */
  workload: "Workload",
  mode: "How you share Johns",
  modeName: { smart: "Smart", classic: "Classic" } as Record<string, string>,
  modeMeta: {
    smart: "Turns planned for you from points, who did what recently, and everyone’s preferences. Nobody gets the same John twice running.",
    classic: "Take turns in a set order. Every John goes round everyone the same way each time.",
  } as Record<string, string>,
  modeFoot: "Both use your budget, one a day and fresh starts.",
  /** Describe your house, once the first list is in: the one question it asks about the deal. */
  modeAsk: "One last thing: how should the house share Johns?",
  modeLater: "You can change this any time in House rules.",
  budget: "Effort each week",
  /** "Light, 2 points"; "No limit". */
  budgetName: (budget: number) => (budget === 0 ? "No limit" : `${BUDGET_WORD[budget] ?? "Up to"}, ${budget} points`),
  /** As the rules read: "Light, 2 points each". */
  budgetEach: (budget: number) => (budget === 0 ? "No limit" : `${BUDGET_WORD[budget] ?? "Up to"}, ${budget} points each`),
  suggested: "Suggested.",
  johnsEach: (n: number) =>
    n < 1.5 ? "About one John each." : `About ${["two", "three", "four", "five", "six"][Math.round(n) - 2] ?? Math.round(n)} each.`,
  everyWeek: "Everything, every week.",
  onTime: "Everything on its own schedule.",
  mostWeekly: "Most come round every week.",
  /** How often weekly Johns come round on a budget; `all`: every John on the list is weekly. */
  weeklyEvery: (lo: number, hi: number, all: boolean) =>
    `${all ? "Each comes" : "Weekly Johns come"} round every ${lo === hi ? (lo === 1 ? "week" : `${lo} weeks`) : `${lo} to ${hi} weeks`}.`,
  someWait: "Some wait a few weeks for their turn.",
  noLimit: "Everything, however long the list.",
  budgetFoot: "Everyone gets at least one John, even one bigger than the budget.",
  tooLong: (need: number) =>
    `Your list asks about ${Math.round(need)} points a week each. Taking some off, or making some less often, would help.`,

  /** The John form. */
  keepDay: "Keep its day",
  keepDayMeta: "Always on its own day, whatever the budget, like bins night.",
  /** In the list's line: "Every week, due Thu 20:00, keeps its day". */
  keepsDay: "keeps its day",

  /** Preferences, under House, You. */
  prefs: "Preferences",
  prefsNone: "No preferences",
  days: "Days that suit me",
  daysHint: "Your Johns land on these days, unless a John keeps its own day.",
  anyDay: "Any day",
  anyTime: "Any",
  bestTime: "My best time",
  bestTimeHint: "It’s the time Plan it suggests.",
  time: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as Record<string, string>,
  /** In a sentence: "mornings". */
  timeOften: { morning: "mornings", afternoon: "afternoons", evening: "evenings" } as Record<string, string>,
  noPreference: "No preference",
  johns: "Johns",
  rather: { "1": "Rather do", "0": "No preference", "-1": "Rather not" } as Record<string, string>,
  prefsNote: "These change when you get a John and the order of turns. Everyone still does their fair share.",
  prefsSaved: "Preferences saved",

  /** Plan it. */
  plan: "Plan it",
  planTitle: "When will you do it?",
  planBody: (due: string) => `Due ${due}. We’ll remind you at the time you pick.`,
  /** A time to pick: "Your best time: morning". */
  yourBest: (time: string) => `Your best time: ${time.toLowerCase()}`,
  planFor: (when: string) => `Plan for ${when}`,
  /** On the John: "Thu 08:30, reminder set". */
  planned: (when: string) => `${when}, reminder set`,
  plannedToast: (when: string) => `Planned for ${when}`,
  change: "Change",
  unplan: "Clear the plan",
  unplanned: "Plan cleared",

  /** Week. */
  waiting: "Waiting their turn",
  /** A waiting John's meta: "2 points, waiting a week". */
  waitingFor: (weeks: number) => (weeks <= 1 ? "waiting a week" : `waiting ${weeks} weeks`),
  waitingNote: "Johns over the budget wait their turn, the longest waiting first. Nobody falls behind for one they weren’t handed.",
  turnsNext: "Whose turn next",
  /** After a John's kind: "Ada’s turn, next week"; "your turn, week of 23 Nov". */
  turnOf: (whose: string, when: string) => `${whose} turn, ${when}`,
  nextWeek: "next week",
  weekOf: (date: string) => `week of ${date}`,
  yourTurn: "your",
  /** On a John in Smart: who had it before. "after Ada"; "after you". */
  after: (who: string) => `after ${who}`,

  /** A John you'd rather not, on Today. */
  someone: "A housemate",
  ratherDoIt: (name: string) => `${name} would rather do it`,
  swapFor: (name: string, john: string, points: string) => `Swap it for ${name}’s ${john}, ${points}`,
  ask: (name: string) => `Ask ${name}`,
  askNote: (name: string, john: string) => `If ${name} says no or doesn’t answer by tonight, ${john} stays yours.`,
  asked: (name: string) => `Asked ${name}. If they say no or don’t answer by tonight, it stays yours.`,
  /** Asked: on the other person's Today. */
  offerTitle: (name: string) => `${name} asks to swap`,
  offerBody: (theirs: string, yours: string, points: string) => `Your ${yours} for their ${theirs}, ${points}. You’d rather do ${theirs}.`,
  accept: "Swap",
  decline: "No thanks",
  swapped: "Swapped",
  declined: "It stays theirs",
  pushTitle: (name: string) => `${name} asks to swap`,
  pushBody: (theirs: string, yours: string) => `Their ${theirs} for your ${yours}. Answer in Jonz by tonight.`,
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

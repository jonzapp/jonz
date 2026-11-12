import { DEFAULT_RULES, type HouseKind } from "./domain";
import { guideMarkdown, guideTopic, HOW_TOPICS, howItWorks, type HowFacts, type HowTopic } from "./how-it-works";
import { LEGAL, PRIVACY_POLICY, TERMS, type LegalPage } from "./legal";
import { HELP_PAGE } from "./reports";
import type { Words } from "./words-for";

/**
 * Every page of Jonz that someone, or an assistant acting for them, can
 * read: each guide topic, Help, Privacy and Terms. One list, so the app,
 * Ask Jonz and a connected app (Claude, ChatGPT) read the same words, and a
 * new page is one entry here: list_pages and read_page offer it with no
 * other change.
 */
export const READING_PAGES = { help: HELP_PAGE, privacy: PRIVACY_POLICY, terms: TERMS } as const satisfies Record<string, LegalPage>;
type ReadingPageId = keyof typeof READING_PAGES;

export const PAGE_IDS = [...HOW_TOPICS, "help", "privacy", "terms"] as const satisfies readonly (HowTopic | ReadingPageId)[];
export type PageId = (typeof PAGE_IDS)[number];

/** What a page is, without its words: enough to choose which one to read. */
export interface PageSummary {
  id: PageId;
  title: string;
  about: string;
  /** Where people read it themselves. */
  url: string;
}

/** What a page is written from: the reader's words, and the house whose numbers the guide uses. */
export interface PageFacts {
  words: Words;
  house: HowFacts;
}

/** A reading page's one line, in the guide's own manner (door.guide.topic.*.meta). */
const READING_ABOUT: Record<ReadingPageId, string> = {
  help: "Reaching Jonz, connecting an AI assistant, your account and your data",
  privacy: "What Jonz keeps, who sees it, who helps run Jonz, and deleting it",
  terms: "The rules for using Jonz and the House Pass",
};

const READING_PATH: Record<ReadingPageId, string> = { help: LEGAL.helpPath, privacy: LEGAL.privacyPath, terms: LEGAL.termsPath };

const isReadingPage = (id: PageId): id is ReadingPageId => id in READING_PAGES;

/** An app path or a web address, as someone outside the app can open it. */
const outside = (href: string) => (href.startsWith("/") ? `${LEGAL.site}${href}` : href);

/** A reading page as one Markdown document: its title, its date, its lead, then each section and its links. */
export function readingMarkdown(page: LegalPage): string {
  const sections = page.sections.map(({ heading, body, links }) => {
    const more = links?.length ? `\n\n${links.map((l) => `- [${l.label}](${outside(l.href)})`).join("\n")}` : "";
    return `## ${heading}\n\n${body}${more}`;
  });
  return [`# ${page.title}`, `_${page.updated}_`, page.lead, ...sections].join("\n\n");
}

/** Every page, by what it's called and what it covers. */
export function listPages(words: Words): PageSummary[] {
  return PAGE_IDS.map((id) => {
    if (isReadingPage(id)) return { id, title: READING_PAGES[id].title, about: READING_ABOUT[id], url: `${LEGAL.site}${READING_PATH[id]}` };
    const { title, meta } = guideTopic(id, words);
    return { id, title, about: meta, url: `${LEGAL.site}/house/guide/${id}` };
  });
}

/** One page as Markdown: a guide topic with the house's own numbers, or a reading page as it stands. */
export function pageMarkdown(id: PageId, { words, house }: PageFacts): string {
  if (isReadingPage(id)) return readingMarkdown(READING_PAGES[id]);
  return `# ${guideTopic(id, words).title}\n\n${guideMarkdown(howItWorks(id, house, words))}`;
}

/** The numbers a guide page uses when there's no house to take them from: a new house's. */
export function newHouseFacts(kind: HouseKind, timezone: string, currency: HowFacts["rules"]["currency"]): HowFacts {
  return { rules: { ...DEFAULT_RULES, timezone, currency }, family: kind === "family", awayMakeup: 100 };
}

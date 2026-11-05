import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  attrsOf,
  cardOf,
  CARDS,
  CARDS_MAX,
  chipOf,
  PAGES,
  parseReply,
  REPLY_FORMAT_GUIDE,
  replyText,
  type Block,
  type Inline,
} from "./reply-format";
import { REPLY_SAMPLES } from "./reply-samples";

// The same cases every run, so a check passes or fails the same any time and a failure can be
// replayed. Look wider on purpose with FC_SEED=<any number> npx vitest run reply-format.
fc.configureGlobal({ seed: Number(process.env.FC_SEED ?? 20261105) });

const sample = (id: string) => REPLY_SAMPLES.find((s) => s.id === id)!.reply;

/** Every inline in a tree of blocks, in reading order. */
function allInlines(blocks: Block[]): Inline[] {
  const kids = (ks: Inline[]): Inline[] =>
    ks.flatMap((k) => [k, ...("kids" in k ? kids(k.kids) : [])]);
  return blocks.flatMap((b) => {
    switch (b.t) {
      case "p":
      case "heading":
        return kids(b.kids);
      case "list":
        return b.items.flatMap((i) => allInlines(i.blocks));
      case "quote":
        return allInlines(b.blocks);
      case "table":
        return [...b.head, ...b.rows.flat()].flatMap(kids);
      default:
        return [];
    }
  });
}
const words = (blocks: Block[]) =>
  allInlines(blocks)
    .map((k) => (k.t === "text" ? k.text : k.t === "chip" ? k.label : ""))
    .join("");

describe("parseReply", () => {
  it("reads plain words as one paragraph", () => {
    expect(parseReply("Any time.")).toEqual([
      { t: "p", kids: [{ t: "text", text: "Any time." }] },
    ]);
  });

  it("is empty for nothing", () => {
    expect(parseReply("")).toEqual([]);
    expect(parseReply("   \n\n ")).toEqual([]);
  });

  it("reads bold, italics and struck words", () => {
    expect(parseReply("**Two Johns** are *open*, ~~not three~~")).toEqual([
      {
        t: "p",
        kids: [
          { t: "strong", kids: [{ t: "text", text: "Two Johns" }] },
          { t: "text", text: " are " },
          { t: "em", kids: [{ t: "text", text: "open" }] },
          { t: "text", text: ", " },
          { t: "del", kids: [{ t: "text", text: "not three" }] },
        ],
      },
    ]);
  });

  it("reads every heading level as one kind of heading", () => {
    const blocks = parseReply("# One\n## Two\n### Three\n###### Six");
    expect(blocks.map((b) => b.t)).toEqual([
      "heading",
      "heading",
      "heading",
      "heading",
    ]);
  });

  it("reads bullet and numbered lists, with where numbering starts", () => {
    const [bullets, numbers] = parseReply("- a\n- b\n\n3. c\n4. d");
    expect(bullets).toMatchObject({
      t: "list",
      ordered: false,
      items: [{ checked: null }, { checked: null }],
    });
    expect(numbers).toMatchObject({ t: "list", ordered: true, start: 3 });
  });

  it("reads a task list's boxes", () => {
    const [list] = parseReply(sample("checklist")).filter(
      (b) => b.t === "list",
    );
    expect(list).toMatchObject({
      items: [
        { checked: true },
        { checked: false },
        { checked: false },
        { checked: false },
      ],
    });
  });

  it("nests lists three deep, then flattens what's deeper into words", () => {
    const blocks = parseReply("- one\n  - two\n    - three\n      - four");
    const one = blocks[0] as Extract<Block, { t: "list" }>;
    const two = one.items[0].blocks[1] as Extract<Block, { t: "list" }>;
    const three = two.items[0].blocks[1] as Extract<Block, { t: "list" }>;
    expect(three.t).toBe("list");
    expect(three.items[0].blocks.map((b) => b.t)).toEqual(["p", "p"]);
    expect(words(three.items[0].blocks)).toBe("threefour");
  });

  it("reads a table with its alignment", () => {
    const table = parseReply(sample("table")).find(
      (b) => b.t === "table",
    ) as Extract<Block, { t: "table" }>;
    expect(table.head.map((c) => words([{ t: "p", kids: c }]))).toEqual([
      "Person",
      "Given",
      "Done",
    ]);
    expect(table.rows).toHaveLength(4);
    expect(table.align).toEqual([null, "right", "right"]);
  });

  it("reads quotes and rules", () => {
    expect(parseReply("> Note this\n\n---").map((b) => b.t)).toEqual([
      "quote",
      "rule",
    ]);
  });

  it("makes chips of jonz: links", () => {
    const chips = allInlines(parseReply(sample("howto"))).filter(
      (k) => k.t === "chip",
    );
    expect(chips).toEqual([
      { t: "chip", kind: "page", ref: "away", label: "Days and time away" },
      { t: "chip", kind: "john", ref: "0000000a", label: "Bins out" },
    ]);
  });

  it("makes cards of directives on a line of their own", () => {
    const cards = parseReply(sample("week")).filter((b) => b.t === "card");
    expect(cards).toEqual([
      { t: "card", card: { card: "week", who: null, open: true } },
      { t: "card", card: { card: "shares" } },
    ]);
  });

  it("keeps a directive's words inside a sentence as words", () => {
    expect(parseReply("Use ::week to see it")).toEqual([
      { t: "p", kids: [{ t: "text", text: "Use ::week to see it" }] },
    ]);
  });

  it(`shows at most ${CARDS_MAX} cards`, () => {
    expect(
      parseReply(
        "::shares\n\n::shares\n\n::shares\n\n::shares\n\n::shares",
      ).filter((b) => b.t === "card"),
    ).toHaveLength(CARDS_MAX);
  });

  it("shows nothing it doesn't trust as anything but words", () => {
    const blocks = parseReply(sample("messy"));
    const inl = allInlines(blocks);
    // No chips for the web link, the gone John aside (the app decides those), the unknown page.
    expect(
      inl.filter((k) => k.t === "chip").map((k) => (k as { ref: string }).ref),
    ).toEqual(["ffffffff", "Zed"]);
    // No card for ::nonsense.
    expect(blocks.some((b) => b.t === "card")).toBe(false);
    const all = words(blocks);
    expect(all).toContain("<b>raw HTML</b>");
    expect(all).toContain("web link");
    expect(all).not.toContain("https://");
    expect(all).toContain("image");
    expect(all).toContain("DROP TABLE johns;");
    expect(all).toContain("Fish & chips < 5 pts > 2 pts.");
  });

  it("never throws, whatever it's given", () => {
    const nasty = [
      "**",
      "[",
      "](",
      "::",
      "::{",
      "|",
      "| a |\n| - |",
      "- [ ]",
      "> > > > > > deep",
      "`",
      "\u0000",
      "a".repeat(5000),
      "1. \n2. ",
      "<script>alert(1)</script>",
    ];
    for (const n of nasty) expect(() => parseReply(n)).not.toThrow();
    expect(words(parseReply("<script>alert(1)</script>"))).toContain(
      "<script>",
    );
  });

  it("reads every sample", () => {
    for (const s of REPLY_SAMPLES)
      expect(parseReply(s.reply).length, s.id).toBeGreaterThan(0);
  });
});

describe("chipOf", () => {
  it("knows johns, people and pages", () => {
    expect(chipOf("jonz:john/3f2a9c1e", "Bins")).toEqual({
      t: "chip",
      kind: "john",
      ref: "3f2a9c1e",
      label: "Bins",
    });
    expect(chipOf("jonz:person/Priya", "Priya")).toMatchObject({
      kind: "person",
      ref: "Priya",
    });
    expect(chipOf("JONZ:Page/Away", "Away")).toMatchObject({
      kind: "page",
      ref: "away",
    });
    expect(chipOf("jonz:person/Mary%20Ann", "Mary Ann")).toMatchObject({
      ref: "Mary Ann",
    });
  });

  it("refuses anything else", () => {
    expect(chipOf("https://jonz.app", "x")).toBeNull();
    expect(chipOf("jonz:page/admin", "x")).toBeNull();
    expect(chipOf("jonz:thing/1", "x")).toBeNull();
    expect(chipOf("jonz:john/", "x")).toBeNull();
    expect(chipOf("jonz:john/abc", " ")).toBeNull();
  });
});

describe("cards", () => {
  it("reads attributes, quoted or bare, straight or curly", () => {
    expect(attrsOf(`who="me" open`)).toEqual({ who: "me", open: "" });
    expect(attrsOf(`who=“Priya”`)).toEqual({ who: "Priya" });
    expect(attrsOf(`refs=abc`)).toEqual({ refs: "abc" });
  });

  it("checks each card's attributes", () => {
    expect(cardOf("week", { who: "everyone" })).toEqual({
      card: "week",
      who: null,
      open: false,
    });
    expect(cardOf("week", { who: "Sam", open: "" })).toEqual({
      card: "week",
      who: "Sam",
      open: true,
    });
    expect(cardOf("johns", { refs: "0000000c, 0000000e nope!" })).toEqual({
      card: "johns",
      refs: ["0000000c", "0000000e"],
    });
    expect(cardOf("johns", {})).toEqual({ card: "johns", refs: [] });
    expect(cardOf("map", {})).toBeNull();
  });
});

describe("replyText", () => {
  it("reads a reply out as plain lines", () => {
    expect(replyText(sample("howto"))).toBe(
      [
        "Book time away",
        "1. Open Days and time away.",
        "2. Tap Book time away.",
        "3. Pick the days and tap Save.",
        "While you're away, the deal leaves you out, so Bins out and your other Johns go to whoever's home.",
      ].join("\n"),
    );
  });

  it("marks a task list and leaves cards out", () => {
    expect(replyText(sample("checklist"))).toContain("☑ Tell the house");
    expect(replyText(sample("week"))).not.toContain("::");
  });
});

describe("the prompt's guide", () => {
  it("names every page and every card the app draws, and nothing else", () => {
    for (const p of Object.keys(PAGES))
      expect(REPLY_FORMAT_GUIDE).toContain(
        `${p} (${PAGES[p as keyof typeof PAGES].label})`,
      );
    for (const c of CARDS) expect(REPLY_FORMAT_GUIDE).toContain(`::${c}`);
    const named = [...REPLY_FORMAT_GUIDE.matchAll(/::([a-z]+)/g)].map(
      (m) => m[1],
    );
    expect(new Set(named)).toEqual(new Set(CARDS));
  });

  it("writes every example in it so the app reads it as meant", () => {
    const examples = [
      ...REPLY_FORMAT_GUIDE.matchAll(/(::[a-z]+(?:\{[^}]*\})?)/g),
    ].map((m) => m[1]);
    for (const e of examples)
      expect(parseReply(e), e).toEqual([
        { t: "card", card: expect.any(Object) },
      ]);
  });
});

/** Property tests: whatever Claude writes, the reader holds. */
describe("parseReply, for any text", () => {
  const markdownish = fc
    .array(
      fc.oneof(
        fc.string(),
        fc.constantFrom(
          "**",
          "*",
          "_",
          "~~",
          "`",
          "[",
          "](",
          ")",
          "jonz:john/",
          "jonz:person/",
          "jonz:page/",
          "https://x.y",
          "::",
          "::week",
          "{",
          "}",
          "|",
          "---",
          "- ",
          "1. ",
          "> ",
          "#",
          "\n",
          "\n\n",
          "  ",
          "<b>",
          "&amp;",
          "![",
          "- [ ] ",
          "- [x] ",
        ),
      ),
      { maxLength: 60 },
    )
    .map((parts) => parts.join(""));

  it("never throws, and makes only the blocks and runs the app draws", () => {
    const blockKinds = new Set([
      "p",
      "heading",
      "list",
      "quote",
      "table",
      "card",
      "rule",
    ]);
    const runKinds = new Set(["text", "strong", "em", "del", "chip", "br"]);
    const walk = (bs: Block[]): void => {
      for (const b of bs) {
        expect(blockKinds.has(b.t)).toBe(true);
        if (b.t === "list") b.items.forEach((i) => walk(i.blocks));
        if (b.t === "quote") walk(b.blocks);
      }
    };
    fc.assert(
      fc.property(markdownish, (src) => {
        const blocks = parseReply(src);
        walk(blocks);
        for (const k of allInlines(blocks))
          expect(runKinds.has(k.t)).toBe(true);
        expect(blocks.filter((b) => b.t === "card").length).toBeLessThanOrEqual(
          CARDS_MAX,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("never makes a chip that leaves the app", () => {
    fc.assert(
      fc.property(
        markdownish,
        fc.webUrl(),
        fc.string({ minLength: 1, maxLength: 20 }),
        (before, url, label) => {
          const chips = allInlines(
            parseReply(`${before}\n\n[${label.replace(/[[\]]/g, "")}](${url})`),
          ).filter((k) => k.t === "chip");
          for (const c of chips)
            expect(["john", "person", "page"]).toContain(
              (c as { kind: string }).kind,
            );
          expect(
            chips.some((c) => (c as { ref: string }).ref.includes("://")),
          ).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("keeps every word of text with no Markdown in it", () => {
    // Starting with a letter: "0. a" or "1) a" at the start is a numbered list, which is Markdown.
    const plainWords = fc
      .tuple(
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9,.'’?!]{0,11}$/),
        fc.array(fc.stringMatching(/^[A-Za-z0-9,.'’?!]{1,12}$/), {
          maxLength: 29,
        }),
      )
      .map(([first, ws]) => [first, ...ws].join(" "));
    fc.assert(
      fc.property(plainWords, (src) => {
        expect(words(parseReply(src))).toBe(src);
      }),
      { numRuns: 300 },
    );
  });
});

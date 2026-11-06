/**
 * Sample Ask Jonz replies, the kinds Claude writes and the messy ones it
 * might: the format's tests read them, the style page draws them, and the
 * screenshot test pictures them. Refs and names match the style page's
 * sample house (Glyn, Sam, Priya, Tom; Bins out 0000000a, Bathroom clean
 * 0000000b, Kitchen clean 0000000c, Vacuum the living room 0000000d).
 */
export interface ReplySample {
  id: string;
  /** What the person asked. */
  asked: string;
  /** What Jonz said, as Claude writes it. */
  reply: string;
}

export const REPLY_SAMPLES: readonly ReplySample[] = [
  {
    id: "short",
    asked: "Thanks!",
    reply: "Any time. Shout if you want to change anything.",
  },
  {
    id: "week",
    asked: "What's left this week, and is anyone behind?",
    reply: `**Two Johns** are still open this week:

::week{open}

On fair shares, [Priya](jonz:person/Priya) is **6 pts behind**, so the deal gives her a bit more next week.

::shares`,
  },
  {
    id: "mine",
    asked: "What have I got this week?",
    reply: `You've got three Johns this week, and [Bathroom clean](jonz:john/0000000b) is the big one:

::week{who="me"}

Tick each one on [Today](jonz:page/today) when it's done.`,
  },
  {
    id: "howto",
    asked: "How do I tell Jonz I'm away next week?",
    reply: `### Book time away

1. Open [Days and time away](jonz:page/away).
2. Tap **Book time away**.
3. Pick the days and tap **Save**.

While you're away, the deal leaves you out, so [Bins out](jonz:john/0000000a) and your other Johns go to *whoever's home*.`,
  },
  {
    id: "explain",
    asked: "Why did I get the bathroom again?",
    reply: `The deal looks at two things:

- **Points:** it spreads them so everyone gets about the same each week.
- **Fair shares:** whoever is behind gets a bit more. You were **3 pts behind** after last week, so you got one of the bigger Johns.

It isn't about the bathroom itself: next week it'll most likely go to [Tom](jonz:person/Tom), who's now furthest ahead.

> Want it to stop? Ask an admin to set **Classic** on [House rules](jonz:page/rules), which takes turns instead.`,
  },
  {
    id: "table",
    asked: "Compare everyone's points this month",
    reply: `Here's November so far:

| Person | Given | Done |
| --- | ---: | ---: |
| You | 24 | 24 |
| Sam | 22 | 19 |
| Priya | 25 | 21 |
| Tom | 23 | 26 |

[Sam](jonz:person/Sam) is **3 behind** and [Tom](jonz:person/Tom) is **3 ahead**: Tom covered Sam's [Bins out](jonz:john/0000000a) last Thursday.`,
  },
  {
    id: "list",
    asked: "Show me the kitchen Johns",
    reply: `Two Johns on the list are in the kitchen:

::johns{refs="0000000c 0000000e"}

Want me to make [Kitchen clean](jonz:john/0000000c) every other day instead?`,
  },
  {
    id: "checklist",
    asked: "What should I do before I move out?",
    reply: `A few things, in order:

- [x] Tell the house (you've done this)
- [ ] Set your moving-out day on [You](jonz:page/you)
- [ ] Settle up on [Stake](jonz:page/stake)
- [ ] Hand admin to someone if you're the only one

Once your day comes, the deal leaves you out on its own.`,
  },
  {
    id: "nested",
    asked: "What's the plan for the weekend?",
    reply: `**Saturday**
- [Bathroom clean](jonz:john/0000000b), Priya, by 18:00
- Food shop, you, by 11:00
  - Big shop this week: it's the first of the month
    - Use the shared list

**Sunday**
- [Vacuum the living room](jonz:john/0000000d), Tom`,
  },
  {
    id: "long",
    asked: "Explain how the whole app works",
    reply: `### The John list
Every chore is a **John**. The list says how often each one happens, on which day, and how much work it is in points.

### The deal
At the start of each week, Jonz deals the Johns out. It's fair two ways: everyone gets about the same points, and anyone behind on [fair shares](jonz:page/shares) gets a bit more.

### Ticking
Tick a John when it's done. Housemates have a while to question a tick. A John not done by its time is **late**, and later still, **missed**.

### Money
If your house has a [Stake](jonz:page/stake), late and missed Johns cost a little at the end of the month.

---

Anything there you want to change?`,
  },
  {
    id: "messy",
    asked: "Try breaking it",
    reply: `Some things the app shows as plain words: <b>raw HTML</b>, a [web link](https://example.com), an ![image](https://example.com/x.png), \`code\`, a [John that's gone](jonz:john/ffffffff), [someone who left](jonz:person/Zed), a [page that isn't](jonz:page/nowhere) and a card it doesn't know:

::nonsense{x="1"}

\`\`\`
DROP TABLE johns;
\`\`\`

**Unclosed bold, ~~struck~~ and _italic_ still read fine. Fish & chips < 5 pts > 2 pts.`,
  },
  {
    id: "family",
    asked: "What does Maya have left?",
    reply: `[Maya](jonz:person/Maya) has one John left today:

::week{who="Maya" open}

When she ticks it, it waits for **your OK** before it counts.`,
  },
];

---
name: design-options-picker
description: Use whenever the user asks to see visuals, mockups, designs, alternates or options to choose between. Shows them in one standard picker page, themed in the product's house style, with items, options, screen sizes, Day/Night and live previews.
---

# Design options picker

When someone asks to see a design, visual options, alternates or mockups, show them in the standard picker page, not a page designed from scratch. The person always gets the same controls in the same places, so they can compare quickly, often from a phone.

## Before drawing anything: the house style

The picker page and the mockups both wear the product's own house style.

1. Find the project's house style: a style guide (for example `docs/style/`), theme or tokens file, brand kit, or a house-style skill. Read it. If none exists, look at the app's real screens and copy their colours, fonts, spacing and words.
2. Set `theme` (below) from it, so the picker's own chrome uses the product's colours and fonts, light and dark.
3. Draw every mockup with the same tokens, components and wording as the real app. Follow the style guide's rules (button styles, list groups, title style, spacing, what not to do).
4. If the project's rules say options must be pictures of the real app (Jonz's do), make every step an `img` screenshot of the real build, and use `liveUrl` (a preview deploy of the branch, or staging) for Live preview instead of hand-drawn HTML.

## What to make

1. **Items.** If the work touches several separate things (for example the admin page and the normal page for the same feature), put them in one page as separate `items`. Each item has its own question, options and recommendation. The person switches between them at the top. Don't make one page per item.
2. **2 to 4 real options per item.** All options in an item answer the same question about the same thing. Never mix options for different places.
3. **Recommend one per item.** Set `recommended` and one sentence of `why`.
4. **Add "Now" when something exists today** (`now: true`), so the person can compare. Give it a `liveUrl` to the real app when there is one.
5. **Flows.** When an option takes more than one screen (a list, then a sheet, then a done state), give that screen size a list of steps instead of one picture. Every option in an item should show the same steps where it can.
6. **Every option on every screen size.** Default to `phone` and `laptop`. Add `tablet` or `wide` (1920) only when they matter.
7. **Both looks.** Every mockup works in Day and Night (light and dark), using the product's own dark colours.
8. **Make it tappable.** Put `data-go="next"` (or `back`, `start`, a step number, or a step's label) on the buttons and rows that lead somewhere, so Live preview can be tapped through like the real thing. For more behaviour (typing, toggles), add a `setup(root, ctx)` function.
9. **Real sample data** (names, dates, amounts), never lorem ipsum. Plain words: short option names (2 to 4 words), a one-sentence summary, one-line "Good" and "Watch out" points.
10. **When the person rejects options,** republish with only the surviving ones.
11. **Open on One at a time** (`view: 'stage'`), the person's chosen default. Side by side and Scroll all stay as switches.

## How to build it

The picker engine lives in the published artifact **Design picker**: https://claude.ai/artifact/KJZ8DZDicE11piiczUGJyY

In a repo that holds this skill, the same engine is also beside this file (`picker.js`, `picker.css`, and `example.html`, the working example). If the published copy and the repo copy differ, the repo copy wins: publish it with the page as local `files` instead.

The main copy of this skill lives in the shared skills repo, glynfinck/skills (folder `design-options-picker/`). Change it there first, then copy the same files here so agents working in this repo have it without access to that repo.

1. Read it with the Artifact tool (`action: "read"`) to see a full working example: two items, a three-screen flow, a Now option, a theme.
2. Write a new `index.html`: a `<title>`, the viewport-fit meta, Google Fonts links for the product's fonts, `<link rel="stylesheet" href="picker.css">`, `<div id="picker"></div>`, a `<script>` that sets `window.PICKER`, then `<script src="picker.js"></script>` last.
3. Publish it as a new artifact and copy the engine server side, without downloading it:
   `files: { "picker.css": { "artifact": "https://claude.ai/artifact/KJZ8DZDicE11piiczUGJyY", "path": "picker.css" }, "picker.js": { "artifact": "https://claude.ai/artifact/KJZ8DZDicE11piiczUGJyY", "path": "picker.js" } }`
4. Screenshots of the real app go in as published files too (for example `img/a-phone-day.png`) and are used as `{ img: ... }` steps.
5. Before publishing, take one look at phone and laptop width in Day and Night if the session can, fix what is broken, then publish.

## The `window.PICKER` shape

```js
window.PICKER = {
  project: 'Product: what this is about',   // small line above the title
  title: 'Today and the admin People page',
  intro: 'One or two plain sentences of context.',
  theme: {                                  // from the house style
    font: '"Overpass", Arial, sans-serif', display: '"Overpass", Arial, sans-serif',
    titleCase: 'uppercase', titleWeight: 900,
    light: { bg, surface, sunk, fg, muted, line, accent, onAccent, rec, onRec, bezel },  // colours
    dark:  { bg, surface, sunk, fg, muted, line, accent, onAccent, rec, onRec, bezel }
  },
  screens: ['phone', 'laptop'],   // phone 390x844, tablet 820x1180, laptop 1440x900, wide 1920x1080,
                                  // or { id, label, width, height, frame: 'phone' | 'tablet' | 'laptop' }
  looks: ['day', 'night'],        // first light, second dark; lookLabels can rename them
  view: 'stage',                  // 'stage' (one at a time), 'side' (side by side), 'scroll' (scroll all)
  css: '...',                     // CSS shared by every HTML mockup (light on :host, dark on :host(.night))
  items: [                        // or, for one item, put question/recommended/why/options at the top level
    { id: 'today', name: 'Today', question: 'Which way should Today show your next task?',
      recommended: 'a', why: 'One sentence.', screens: [...optional per item], css: '...optional extra',
      options: [
        { id: 'now', now: true, name: 'As it is now', summary: '...', liveUrl: 'https://app.example.com',
          screens: { phone: '<div class="app">...</div>', laptop: { img: 'img/now-laptop.png' } } },
        { id: 'a', name: 'Sign card', summary: '...', good: ['...'], watch: ['...'],
          screens: {
            phone: [                                   // a flow: one entry per screen
              { label: 'Today', html: '...<button data-go="next">Mark done</button>...' },
              { label: 'Mark done', html: '...' },
              { label: 'Done', img: { day: 'img/a-done-day.png', night: 'img/a-done-night.png' } }
            ],
            laptop: function (look, screen) { return '...'; }
          },
          setup: function (root, ctx) { /* optional: wire up typing, toggles; ctx.go('next') */ } }
      ] }
  ]
};
```

HTML mockups are drawn in their own sealed box (a shadow root) at the screen's real pixel size, then scaled to fit, so their CSS never leaks. The box gets the look's id as its class, so put light tokens on `:host` and dark ones on `:host(.night)`. Each mockup's outer element should be `width:100%; height:100%`. Fonts must be linked in the page head.

## What the person gets

- Item tabs at the top (when there are several), then option buttons with a Recommended badge, then Screen, Look and Show switches, in a bar that stays on screen.
- The item's question with the recommendation, and "Copy my picks" (for example "Picks: Today A (Sign card); Admin: People A (Table with filters)") to paste in the chat.
- One at a time: the option's screens (a flow sits side by side on a phone, one under another on a laptop) with its notes, Live preview, Previous and Next.
- Live preview: the option full size and clickable, moving through its flow; "Open the real app" when it has a `liveUrl`.
- A link that remembers what they were looking at, for example `#admin--a-laptop-night-stage`.

## After publishing

Share the link with one line per item on what you recommend, and ask for the decision (a decision card when the chat offers one; one card per item). Don't repeat the options' details in the chat.

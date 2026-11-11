# Buttons and controls

## Sizes

- **Every control is at least `TAP` (48) tall,** links included (`TextLink`,
  or `Button` with `href`). (AGENTS.md) *Backed by* Material's 48dp, above
  the HIG's 44pt and WCAG 2.2's 24px minimum.
- An icon beside a control's words is `ICON` (20); the glyph in an icon-only
  control is `ICON_ONLY` (22) in a `TAP` square. (**New**)

## Kinds of button

- `Button` `primary` (amber): the one thing to do on a screen, **at most one
  per screen**. `outline`: the secondary. `ghost`: no edge. `hazard`: a
  choice that strikes something out, edged in hazard, words in ink.
  (Focus, #17)
- `TextButton`: a quiet action or a link onward (Undo, See all, Change
  dates ›). (Focus, #17)
- One of a pair you pick from (the vote) uses `chosen`: ink edge on the
  tint, never amber. (Focus, #17)
- **A button on its own fills its column on a phone** (Deal week 1, Copy
  key, Send report, Try again). On a laptop it still fills a card, a sheet,
  a form or a side panel (Today's setup card, Copy key). One on the bare
  page (an empty page's action, Re-deal under the list, Try again) keeps
  its own width at the leading edge of a laptop column wider than
  `FORM_MAX` (520), never stretched across a page (`ButtonRow atEdge`).
  (Copy key A, #75; Week's Deal week 1, 7 Nov) *Backed by* GOV.UK's
  buttons, full width on a phone and their own width from a tablet up, and
  Material's guidance against full-width buttons on wide screens.
- That is a `ButtonRow` with one button in it. **Every `Button` sits in a
  `ButtonRow`**, alone or with others, so no screen decides a button's width
  by hand. The lint rule `jonz/button-in-row` refuses a `Button` laid
  straight in a `View`, and `e2e/client-buttons.spec.ts` measures Week,
  Today, House, its pages and a John's sheet on each phone and the laptop.
  An icon-only button is exempt (it's a square), and so is a button sharing
  its line with words or links: Next up's Photo, the John list's Add a John
  beside its count, the tour's Next beside Back and Skip.
- Screens never restyle a button: no `style` on `Button`, and no hand-made
  `Pressable` dressed as one outside `components/`. (**New**, enforced by
  lint)

## Buttons together

- **Buttons side by side are equal widths,** never sized to their words.
  When they don't both fit on one line (below `NARROW`, or when a label
  would wrap), they stack at full width, the main action first. Use the
  shared button row; never lay one out by hand. (**New**, from the bug
  report drafts, 31 Oct) *Backed by* the HIG's two-button alerts, which sit
  side by side at equal widths and stack when a label is too long, and
  GOV.UK's button groups.
- That is `ButtonRow`: equal shares of the line while each button has at
  least `BUTTON_MIN` (136) and every label fits on one line; otherwise a
  full-width stack. `stacked` keeps it a stack (the front door on a phone).
  The lint rule `jonz/no-hand-made-button-row` refuses buttons laid side by
  side any other way.
- **The one exception** is Today's Next up: Mark done fills the line and
  Photo keeps its own width beside it (an icon alone on a small phone), as
  Focus drew it. (Focus, #17)
- A primary and its secondary are the same height and width, whether side
  by side or stacked. (**New**)

## Icon buttons

- Close, `•••`, the sparkles and any other icon-only control are an
  `IconButton`: one size
  (a 48 square, 20 icon) with one look: no edge, or the outline button's
  edge. Never a heavier ink border. Each has a spoken name. (**New**)
  *Backed by* Nielsen's "consistency and standards" and WCAG 4.1.2.
- **A toggle shows its state in its icon,** with no grey square behind it
  while it's on. (Sparkles A, #48)

## Inputs

- A chat's message box grows as you type to about 5 lines, then scrolls;
  the send arrow sits inside the box. (Ask Jonz, #37)
- In a chat's message box on a computer, Enter sends and Shift+Enter
  starts a new line, as in other chat apps. On a touch screen (a phone, a
  tablet without a mouse) and in the phone apps, Return is a new line and
  the arrow sends. (Ask Jonz Enter, 10 Nov)
- Forms sit in a column capped at `FORM_MAX` (520) on a laptop. (**New**)
- A short select opens in place (`PickRow`); a radio or checkbox is a
  `ChoiceRow`. (AGENTS.md)
- **Sign-in and password boxes work with password managers.** On the web
  each step is a real form (`SignInForm`), Enter sends it, the email box is
  `username` and a new password is `new-password` (with `passwordRules` on
  iOS); where the step has no email box, `HiddenUsername` names the account.
  No spellcheck or autocorrect on either. (Glyn, 1 Nov) *Backed by*
  Chrome's and Apple's password autofill guides.
- **Making an account asks for one name box**, not first and last: what
  your housemates call you. Agreeing to the Terms (and being 13 or older)
  is a tick box you must tick, not a line under the button; no birthday.
  (Glyn, 1 Nov) *Backed by* W3C and GOV.UK guidance on names.
- **A short code is six boxes** (`CodeBoxes`): the admin code and the codes
  we email. The six are equal and span the column edge to edge with the
  button, each a little taller than wide (48 to 64). One real field lies
  over them, so a phone or password manager can fill in the code
  (`one-time-code`), paste works with a space or dash in it, and a screen
  reader hears one field. The code is checked on its sixth digit unless the
  step still needs more (a new password); after a wrong code, the next digit
  starts it over. (Code boxes, 1 Nov) *Backed by* Apple's and the HTML
  standard's one-time-code autofill and WCAG 1.3.5 (input purpose).

## One move, one place

Every John action (tick, photo, undo, immunity, swap, dispute, vote) lives in
the John sheet, opened by tapping that John anywhere. (Focus, #17)

## State and focus

- A chosen, ticked or pressed state is an `aria-*` prop (`aria-checked`,
  `aria-selected`, `aria-disabled`; `aria-pressed` and `aria-expanded` on the
  web), never `accessibilityState`, which react-native-web ignores.
  (AGENTS.md)
- **A focus ring shows for the keyboard, never after a tap,** and never on a
  sheet's close button just because the sheet opened. (**New**) *Backed by*
  WCAG 2.4.7 and the browser's focus-visible behaviour.

# Jonz in French

The French words live in `packages/core/src/locales/fr/`, one file per part
of the app, with the same ids as English's (`locales/en/`). A line French
hasn't got is read in English. This page is what a translator keeps to, so
the app says the same thing the same way everywhere. `words.md` is the same
page for English, and comes first: French says what English says.

French is still being checked (`BEING_CHECKED` in `locales/index.ts`): it's
offered only on staging and locally, and never taken from a phone's
language, until a French speaker has read it through there.

## How it talks

- **Tu, always.** Jonz talks to you like a housemate does. "Coche-le",
  "Ta mise", never "vous".
- **The same to anyone.** Jonz doesn't know whether you're a man or a
  woman, so nothing it says to you agrees with you: "Tu n’es pas là", not
  "Tu es absent"; "Tu as une invitation", not "Tu es invité".
- **Short and plain.** The same as English: a sentence says one thing, and
  a button says what it does ("Marquer comme fait", "Envoyer l’invitation").
- **What other apps say.** A common button or label reads the way well-known
  French apps already say it (Nextcloud, Signal, Element, Mastodon, Firefox,
  Grocy): "Afficher plus", "Tout afficher", "Réessayer", "Quitter",
  "Une erreur est survenue", "Échéance", "Actualités".
- **French typography.**
  - An apostrophe is ’, never '. A plain ' starts quoted text in a line and
    would swallow the words after it (a test checks).
  - A no-break space (U+00A0) goes before ? ! : ; and inside « ». Quotes are
    « » (`common.join.quote`).
  - Money and dates come from the reader's language, so they read "2,50 €"
    and "jeu. 12 nov." without anything in the lines.
- **Gaps are English's.** Every `{name}` and every `{kind, select, …}` or
  `{count, plural, …}` in an English line is in its French line too, with
  the same names (a test checks). A family's sentence stays a whole sentence:
  `{kind, select, family {…} other {…}}`. The one gap French may add is
  `{you, select, true {…} other {…}}` on a Wall line, which always gets it.

## The words

| English | French | Notes |
|---|---|---|
| John, Johns | John, Johns | The app's own word, never translated. "un John". |
| housemates | colocs | "coloc" in a sentence, "colocataire" only where it must be formal. A family never reads either (a test checks). |
| admin | admin | A family's admin is a parent. |
| Parent, Kid | Parent, Enfant | |
| deal (the week's Johns) | distribuer, la distribution | Re-deal: redistribuer. |
| the Stake | la Mise | "ta mise", "pas de mise". |
| forfeit | pénalité | |
| Mark done | Marquer comme fait | As Nextcloud Tasks says it. |
| tick (noun and verb) | coche, cocher | Untick: décocher. |
| cover (someone’s John) | remplacer, faire à sa place | |
| dispute | contester, contestation | |
| Done, Not done | Fait, Pas fait | |
| missed | oublié | "Counts for nobody": ne compte comme travail pour personne ("ne compte pour personne" reads as "doesn’t matter to anyone"). |
| late | en retard | |
| skip | joker | "utiliser un joker". |
| swap | échange, échanger | Swap ready: échange disponible, never "échange prêt" (prêt also means a loan). |
| top the week | finir premier de la semaine | |
| settle up | faire les comptes | |
| square (owing nobody) | quittes | |
| invite, the code | invitation, le code | |
| start a house | créer une maison | |
| house rules | règles de la maison | |
| the Table | le Classement | |
| the Wall | le Mur | |
| Today, Week, House, You | Aujourd’hui, Semaine, Maison, Toi | The tabs. |
| Ask Jonz | Demande à Jonz | |
| on call | de garde | |
| flag | signaler | |
| time away | absence, absences | |
| OK (a parent’s) | valider, validation | |
| the board | le tableau | |
| pocket money | argent de poche | Pay day: jour de paie. |
| fair share | juste part | |
| House Pass, Family Pass | House Pass, Family Pass | Product names, never translated. |

## Left in English

- The owner's pages (`admin.json`): only the owner reads them.
- The legal pages, Supabase's sign-in emails, a pasted link's preview and an
  offer emailed to an address: see `docs/specs/translation.md`.

## For the reader on staging

Rough spots worth a look first:

- Someone's thing reads "de Sam" or "à toi" (`wall.feed.whose`), put after
  the noun. A few lines may read oddly with "à toi".
- A repeating John's timing (`house.repeat.*`) is built from parts, so check
  a few repeats on a John's sheet.
- The Wall gives every line `you` beside `who`, so French says "Tu as coché"
  where English says "You ticked". A line that names you another way may
  still read "Toi …".

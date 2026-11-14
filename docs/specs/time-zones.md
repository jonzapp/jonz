# Time zones

## What it does

A house keeps one time zone, and its weeks, days and due times are set in
it. Each person reads times on their own phone's clock, so someone away
from home (Glyn in Regina, his house in London) sees "due today 15:00", not
the house's 21:00, with nothing saying so. Where a time or a day is set
(a John's due time, booking time away, moving out) it is the house's, and
one note says so while the phone's clock differs. An admin picks the
house's zone from a list they can search by city or country, not a box to
type a name into. Glyn picked Search by city (A) on 14 November 2026, and
the same evening asked for times always on your own clock, with house time
said only where you set one.

## How times are kept

- Every moment is `timestamptz` (UTC underneath); a day is a `date`; a due
  time on a repeating John is the house's wall-clock time
  (`johns.due_time`), so 21:00 stays 21:00 across a clock change. This was
  already so (database standards, rule 6).
- `houses.timezone` is an IANA name the database knows
  (`pg_timezone_names`, checked by the houses trigger). It sets where each
  week starts and ends, which day a John lands on, months for the Stake,
  and anything else that is a calendar.
- A moment is said in the reader's zone: `Viewing.zone` and
  `JohnRowContext.zone` in the app (packages/core/src/viewing.ts), the
  zone the reader is shown. Weeks, months and local dates always use
  `rules.timezone`.

## Seeing times (always your own clock)

- Every time on Today, Week, the Wall and the John sheet is on the phone's
  clock (`useShownZone`), always, with no line or switch saying so. The
  calendar stays the house's: which week it is, the week's range and the
  Stake's months.
- The John sheet's due line adds the house's time in brackets when the
  clocks differ (`clocksDiffer`, so Dublin reads a London house as it is,
  and Abidjan only in summer): "Due today 15:00 (21:00 house time)", with
  the house's weekday when it's another day there: "(Thu 03:00 house
  time)".

## Setting times (house time, said where it matters)

- A John's day and due time, booking time away and the day you move out
  are set on the house's clock and calendar. While the phone's clock says
  another time, each says so in one quiet line (`HouseTimeNote`,
  `houseTimeNote` in packages/core/src/zones.ts): "In house time: London,
  6 hours ahead of you." It sits under the John editor's sentence and on
  its Time step, under the booking sheet's days, and under the moving-out
  calendar. Nothing is said while the clocks agree.
- Pushes say their times on each reader's own clock: the zone saved with
  their notification settings (`notification_prefs.timezone`), or the
  house's until they have one (apps/api/lib/push.ts, `PushLine`). The app
  saves the phone's zone there each time the house opens on a phone that
  has moved (`useKeepMyZone`), so quiet hours follow the phone too.
- Pages that show dates rather than moments (the Stake's months, the Pass,
  the Table, the record) stay in the house's zone.

## Picking the zone (Search by city)

- House, Rules: the Time zone row shows the place ("London, United
  Kingdom"), and under its name the offset and the time there now ("UTC+0,
  01:22 there now"). It opens a sheet.
- The sheet: a search box, then Suggested (the zone set now, and this
  phone's when it's another), then Every zone, A to Z, each with its offset
  and its time now. Typing narrows the list: each word must start a word of
  the city, the country, the zone's name or its country's code, without
  accents or capitals, so "canada" finds every Canadian zone, "new y" New
  York and "sao" São Paulo. The list shows 60 at a time and more as you
  scroll.
- Where the list comes from: `public.time_zones()` (on /v1 as `GET
  /v1/time-zones`, operation `time_zones`) gives every zone the database
  knows by an IANA region name, and UTC. The app keeps those tzdata's
  `zone.tab` lists as a place people live (`ZONE_COUNTRY` in
  packages/core/src/zone-countries.ts, 417 zones with their country), plus
  UTC, plus the house's own zone even if it's an old spelling
  (Asia/Calcutta). The city is the zone name's last part; the country's
  name comes from the phone in the reader's language (`Intl.DisplayNames`),
  and a phone without it shows the city alone.
- A new house still starts in the phone's zone, said as a place on the
  welcome page.

## Edge cases

- A zone the phone reports that the database doesn't know isn't offered as
  "Your phone's"; times still read on it.
- Half-hour and 45-minute zones: "UTC+5:30", "5.5 hours ahead of you".
- The house changes its zone: weeks already dealt keep their moments; due
  times from then on follow the new zone.
- Search finds nothing: "Nothing matches “…”. Try the nearest city, or
  the country."
- `ZONE_COUNTRY` is checked against the database by
  apps/api/tests/db/time-zones.test.ts, so a zone the app offers is always
  one the houses trigger takes. To refresh it after a tzdata release, take
  `zone.tab`'s zone and country columns and keep those `time_zones()`
  returns.

## Platforms

The same on iOS, Android and the web. The phone's zone comes from
`expo-localization` (`getCalendars()`); on the web that is the browser's.

## Done when

- [x] A phone in Regina reading a London house sees its own times, with
      nothing saying so.
- [x] Setting a John's time, booking time away and moving out say they are
      in house time, only while the clocks differ.
- [x] The John sheet gives house time in brackets when the clocks differ.
- [x] Pushes say times on the reader's clock.
- [x] An admin picks the zone from a list searchable by city or country,
      with the zone set now and the phone's at the top.

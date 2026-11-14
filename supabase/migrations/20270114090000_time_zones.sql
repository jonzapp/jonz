-- The time zones a house can be set to (docs/specs/time-zones.md): the
-- places the database knows, by their IANA names (Europe/London,
-- America/Regina), and UTC. The app keeps the ones tzdata's zone.tab lists
-- as a place people live (packages/core/src/zone-countries.ts) and offers
-- them as a list to search, instead of a box to type a name into. Old
-- spellings (US/Central, GB) and the Etc/ offsets are left out here; the
-- trigger on houses still takes any name the database knows.

create function public.time_zones()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select z.name
  from pg_catalog.pg_timezone_names z
  where z.name ~ '^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)/'
     or z.name = 'UTC'
  order by z.name;
$$;
comment on function public.time_zones() is 'The time zones a house can be set to: every place the database knows by its IANA name, and UTC.';

revoke execute on function public.time_zones() from public, anon, authenticated;
grant execute on function public.time_zones() to authenticated;

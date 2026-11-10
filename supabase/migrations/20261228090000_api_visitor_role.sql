-- Someone not signed in (the notices banner) is read through the API's role
-- too, so the Data API can be switched off (docs/specs/api.md, C4b).
--
-- jonz_api becomes `anon` for such a read, in its own transaction
-- (apps/api/lib/db/scope.ts, visitorDbFromPool), and Row Level Security shows
-- it what anyone may see. anon is the least of the roles: it adds nothing
-- jonz_api could not already do as `authenticated`.
grant anon to jonz_api;

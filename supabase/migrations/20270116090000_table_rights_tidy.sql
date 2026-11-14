-- Signed-out and signed-in people held four rights nobody meant them to have
-- on two tables (support_drafts, owner_ask_turns): references, trigger,
-- truncate and maintain. They came from what a new table started with, not
-- from a grant, and nothing uses them: the app reads and writes rows and
-- never empties, alters or maintains a table as either role. They come off
-- every table, and new tables no longer start with them.

revoke references, trigger, truncate, maintain on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke references, trigger, truncate, maintain on tables from anon, authenticated;

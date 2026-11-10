-- Deleting a house in the owner admin failed with "That doesn't fit with
-- what's already saved." for two reasons, both fixed here.
--
-- 1. A move into the house (moves.to_house_id) is set to null when the house
--    goes, but moves_check wanted to_house_id, how and moved_at all null or
--    all filled, so the delete broke the check. Someone who moved and whose
--    new house was later deleted did still move: how and moved_at stay, and
--    only where they went is forgotten. Everything that looks for a move
--    still waiting reads `how is null`, which stays true only for those.
--
-- 2. The /v1 API writes its audit entry after the operation, in the same
--    transaction, naming the house the operation was on. When the operation
--    deleted that house, the entry's house_id pointed at nothing and the
--    whole delete was rolled back. The entry now forgets a house (or person)
--    that's already gone, as it would had they gone a moment later.

-- --- 1. A move into a house that's since been deleted -------------------------

alter table public.moves drop constraint moves_check;
alter table public.moves add constraint moves_check
  check ((how is null) = (moved_at is null) and (how is not null or to_house_id is null));

-- --- 2. The API's audit entry for an operation that deleted its own house -----

create function public.api_audit_entries_forget_gone()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.house_id is not null and not exists (select 1 from public.houses h where h.id = new.house_id) then
    new.house_id := null;
  end if;
  if new.user_id is not null and not exists (select 1 from public.profiles p where p.id = new.user_id) then
    new.user_id := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.api_audit_entries_forget_gone() from public, anon, authenticated;

comment on function public.api_audit_entries_forget_gone() is
  'Before an API audit entry is written: a house or person the operation itself deleted is left out, not refused.';

create trigger api_audit_entries_forget_gone before insert on public.api_audit_entries
  for each row execute function public.api_audit_entries_forget_gone();

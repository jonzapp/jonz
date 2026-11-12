-- Housemates (and apps they connect, such as Claude) can read each group's
-- pool, as they already read the whole share (week_shares, house_balances):
-- the house_group_balances operation shows who is ahead or behind on a
-- group's Johns, beside their whole balance. Reading asks weeks:read, as
-- week_shares does. Only the server writes group shares.

create policy "members see group shares" on public.week_group_shares
  for select to authenticated using (public.can(house_id, 'weeks:read'));

grant select on public.week_group_shares to authenticated;

comment on table public.week_group_shares is 'The part of each housemate''s share of a week that was one group''s Johns, so the deal balances each group''s Johns within the group. Members read it (weeks:read); only the server writes it.';

grant execute on function public.house_group_balances(uuid, date) to authenticated;

comment on function public.house_group_balances(uuid, date) is 'Each housemate''s share of, and work on, each group''s Johns before a week: their balance in that group''s pool. Reads through RLS, as house_balances does.';

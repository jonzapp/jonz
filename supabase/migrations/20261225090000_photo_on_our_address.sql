-- Your photo on our own address (docs/specs/api.md, C3): the app uploads it
-- through /v1 (file_upload) and points your profile at
-- https://jonz.app/files/photo/avatars/<you>/<file>, which apps/api serves
-- from the avatars bucket. set_my_photo takes that address as well as the
-- bucket's own, still only for a file in your own folder.

create or replace function public.set_my_photo(photo text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if photo is null or photo !~ (
    '^(https://[^/?#]+|http://(127\.0\.0\.1|localhost)(:[0-9]+)?)/(storage/v1/object/public|files/photo)/avatars/'
    || me::text || '/[A-Za-z0-9][A-Za-z0-9._-]*(\?v=[0-9]+)?$'
  ) then
    raise exception 'That photo isn''t yours.' using errcode = '22023';
  end if;
  update public.profiles set avatar_url = photo where id = me;
end;
$$;

revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated, service_role;

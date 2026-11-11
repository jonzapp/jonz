-- Each person's own language (docs/specs/translation.md, step 7). Null until
-- the app first saves it from their phone; they change it on You. en-XA is
-- the test language, English made strange, offered only where Jonz is being
-- tried out. The same words live in packages/core/src/locales/index.ts.

alter table public.profiles
  add column language text
  constraint profiles_language_check check (language in ('en', 'en-XA'));
comment on column public.profiles.language is
  'The language this person reads Jonz in; null until the app saves their phone''s.';

grant update (language) on public.profiles to authenticated;

create function public.my_language()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select p.language from public.profiles p where p.id = (select auth.uid());
$$;
comment on function public.my_language() is 'The language you read Jonz in, or null before the app has saved one.';

create function public.set_my_language(p_language text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.profiles set language = p_language where id = (select auth.uid());
$$;
comment on function public.set_my_language(text) is 'Change the language you read Jonz in.';

revoke execute on function public.my_language(), public.set_my_language(text) from public, anon;
grant execute on function public.my_language(), public.set_my_language(text) to authenticated;

-- French, the first language beside English (docs/specs/translation.md,
-- step 8). The same list lives in packages/core/src/locales/index.ts.

alter table public.profiles
  drop constraint profiles_language_check,
  add constraint profiles_language_check check (language in ('en', 'fr', 'en-XA'));

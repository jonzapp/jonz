-- Every bucket private (docs/specs/api.md, C5). People's photos are shown
-- on our own address (/files/photo/avatars/…, migration
-- photo_on_our_address), which reads them with the server's key, so
-- Storage's public address for the avatars bucket closes. Uploads into your
-- own folder keep their policies.

update storage.buckets set public = false where id = 'avatars';

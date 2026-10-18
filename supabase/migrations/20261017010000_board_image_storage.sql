-- Recife Sketch: private storage for images pasted onto whiteboards.
-- Run once in the Supabase SQL editor (after the first migration). Safe to re-run.
--
-- Images used to be stored inside each board's saved data, which made saves
-- several megabytes and timed out. Now each image is a file here and the
-- board only stores a short link to it.
--
-- Layout: board-images/<student user id>/<board id>/<random>.<ext>
-- Students can only ever read, add or remove files in their own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-images', 'board-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "board_images_select_own" on storage.objects;
create policy "board_images_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'board-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "board_images_insert_own" on storage.objects;
create policy "board_images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'board-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "board_images_delete_own" on storage.objects;
create policy "board_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'board-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

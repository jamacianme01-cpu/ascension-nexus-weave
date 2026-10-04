insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ascension-models',
  'ascension-models',
  true,
  52428800,
  array['model/gltf-binary', 'application/octet-stream']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Carries the real generated concept image into Hunyuan3D image-to-3D jobs.
alter table public.ascension_model_jobs
  add column if not exists source_image_url text;

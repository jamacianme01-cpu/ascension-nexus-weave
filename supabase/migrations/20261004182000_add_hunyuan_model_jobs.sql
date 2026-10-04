create table if not exists public.ascension_model_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ascension_execution_requests(id) on delete cascade,
  pathway_id text not null,
  label text not null,
  summary text not null default '',
  visual_svg text not null,
  status text not null default 'queued'
    check (status in ('queued','claimed','running','completed','failed')),
  claimed_at timestamptz,
  claimed_by text,
  model_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(request_id, pathway_id)
);

alter table public.ascension_model_jobs enable row level security;

create index if not exists ascension_model_jobs_status_created_idx
  on public.ascension_model_jobs(status, created_at);

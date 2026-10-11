create type public.app_role as enum ('owner', 'publication_reader');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Users see their own roles; owner sees all"
on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'owner'));

create policy "Owner grants publication readers"
on public.user_roles for insert to authenticated
with check (public.has_role(auth.uid(), 'owner') and role = 'publication_reader' and granted_by = auth.uid());

create policy "Owner revokes publication readers"
on public.user_roles for delete to authenticated
using (public.has_role(auth.uid(), 'owner') and role = 'publication_reader');

insert into public.user_roles (user_id, role) values ('3b83f013-1d98-4a6a-b7ef-e97b6f89c4bd', 'owner');

drop policy "Signed-in users can read governed publications" on public.ascension_publications;
create policy "Owner and owner-approved readers can read governed publications"
on public.ascension_publications for select to authenticated
using (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'publication_reader'));
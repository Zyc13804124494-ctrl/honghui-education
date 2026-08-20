create table public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  subject text,
  title text not null,
  content text,
  homework_date date not null,
  due_date date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_assignments_title_not_blank check (length(trim(title)) > 0),
  constraint homework_assignments_due_date_check check (due_date is null or due_date >= homework_date)
);

create index homework_assignments_class_date_idx
  on public.homework_assignments (class_id, homework_date);

create index homework_assignments_campus_date_idx
  on public.homework_assignments (campus_id, homework_date);

create index homework_assignments_organization_date_idx
  on public.homework_assignments (organization_id, homework_date);

create index homework_assignments_created_by_idx
  on public.homework_assignments (created_by);

create or replace function public.update_homework_assignments_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger homework_assignments_updated_at_trigger
  before update on public.homework_assignments
  for each row
  execute procedure public.update_homework_assignments_updated_at();

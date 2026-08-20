create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  grade text not null,
  school_year text not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_name_not_blank check (length(trim(name)) > 0),
  constraint classes_grade_not_blank check (length(trim(grade)) > 0),
  constraint classes_school_year_not_blank check (length(trim(school_year)) > 0),
  constraint classes_campus_name_year_key unique (campus_id, name, school_year)
);

create index classes_organization_status_idx
  on public.classes (organization_id, status);

create index classes_campus_status_idx
  on public.classes (campus_id, status);

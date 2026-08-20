create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  student_no text,
  real_name text not null,
  gender text not null default 'unknown',
  birthday date,
  grade text not null,
  school_name text,
  admission_date date,
  status text not null default 'active',
  health_note text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint students_real_name_not_blank check (length(trim(real_name)) > 0),
  constraint students_grade_not_blank check (length(trim(grade)) > 0),
  constraint students_gender_check check (gender in ('male', 'female', 'unknown')),
  constraint students_status_check check (status in ('active', 'paused', 'graduated', 'left')),
  constraint students_organization_student_no_key unique (organization_id, student_no)
);

create index students_organization_status_idx
  on public.students (organization_id, status);

create index students_campus_status_idx
  on public.students (campus_id, status);

create index students_real_name_idx
  on public.students (real_name);

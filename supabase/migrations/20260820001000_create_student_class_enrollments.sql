create table public.student_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  start_date date not null,
  end_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  constraint student_class_enrollments_date_range_check
    check (end_date is null or end_date >= start_date)
);

create index student_class_enrollments_student_current_idx
  on public.student_class_enrollments (student_id, is_current);

create index student_class_enrollments_class_current_idx
  on public.student_class_enrollments (class_id, is_current);

create unique index student_class_enrollments_one_current_idx
  on public.student_class_enrollments (student_id)
  where is_current = true;

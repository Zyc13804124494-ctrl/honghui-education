create table public.student_homework_records (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework_assignments(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  completion_status public.completion_status not null default 'not_started',
  completed_at timestamptz,
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_homework_records_homework_student_key unique (homework_id, student_id),
  constraint student_homework_records_not_started_completed_at_check
    check (completion_status <> 'not_started'::public.completion_status or completed_at is null)
);

create index student_homework_records_student_idx
  on public.student_homework_records (student_id);

create index student_homework_records_homework_idx
  on public.student_homework_records (homework_id);

create index student_homework_records_recorded_by_idx
  on public.student_homework_records (recorded_by);

create index student_homework_records_status_idx
  on public.student_homework_records (completion_status);

create trigger student_homework_records_updated_at_trigger
  before update on public.student_homework_records
  for each row
  execute procedure public.update_homework_assignments_updated_at();

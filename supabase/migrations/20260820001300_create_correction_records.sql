create table public.correction_records (
  id uuid primary key default gen_random_uuid(),
  homework_record_id uuid not null references public.student_homework_records(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  correction_status public.correction_status not null default 'pending',
  score numeric,
  rating text,
  comment text,
  correction_items jsonb,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint correction_records_score_check check (score is null or (score >= 0 and score <= 100)),
  constraint correction_records_pending_corrected_at_check
    check (correction_status <> 'pending'::public.correction_status or corrected_at is null)
);

create index correction_records_homework_record_idx
  on public.correction_records (homework_record_id);

create index correction_records_reviewer_idx
  on public.correction_records (reviewer_id);

create index correction_records_status_idx
  on public.correction_records (correction_status);

create index correction_records_corrected_at_idx
  on public.correction_records (corrected_at);

create trigger correction_records_updated_at_trigger
  before update on public.correction_records
  for each row
  execute procedure public.update_homework_assignments_updated_at();

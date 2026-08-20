create type public.attendance_status as enum ('present', 'late', 'leave', 'absent');

create table public.student_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  attendance_date date not null,
  status public.attendance_status not null default 'present',
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_attendance_records_student_date_key unique (student_id, attendance_date)
);

create index student_attendance_records_student_idx
  on public.student_attendance_records (student_id);

create index student_attendance_records_class_idx
  on public.student_attendance_records (class_id);

create index student_attendance_records_date_idx
  on public.student_attendance_records (attendance_date);

create index student_attendance_records_organization_date_idx
  on public.student_attendance_records (organization_id, attendance_date);

create trigger student_attendance_records_updated_at_trigger
  before update on public.student_attendance_records
  for each row
  execute procedure public.update_homework_assignments_updated_at();

alter table public.student_attendance_records enable row level security;

create policy student_attendance_records_select_authorized
  on public.student_attendance_records for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(class_id)
  );

create policy student_attendance_records_insert_admin
  on public.student_attendance_records for insert
  to authenticated
  with check (
    public.is_org_admin(organization_id)
    and exists (
      select 1
      from public.classes c
      join public.students s on s.id = student_attendance_records.student_id
      where c.id = student_attendance_records.class_id
        and c.organization_id = student_attendance_records.organization_id
        and c.campus_id = student_attendance_records.campus_id
        and s.organization_id = student_attendance_records.organization_id
        and s.campus_id = student_attendance_records.campus_id
    )
  );

create policy student_attendance_records_update_authorized
  on public.student_attendance_records for update
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(class_id)
  )
  with check (
    (
      public.is_org_admin(organization_id)
      or public.is_class_teacher(class_id)
    )
    and exists (
      select 1
      from public.classes c
      join public.students s on s.id = student_attendance_records.student_id
      where c.id = student_attendance_records.class_id
        and c.organization_id = student_attendance_records.organization_id
        and c.campus_id = student_attendance_records.campus_id
        and s.organization_id = student_attendance_records.organization_id
        and s.campus_id = student_attendance_records.campus_id
    )
  );

create type public.payment_status as enum ('unpaid', 'paid', 'partial', 'overdue');

create table public.student_fee_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  amount numeric(10, 2) not null,
  payment_date date,
  due_date date not null,
  status public.payment_status not null default 'unpaid',
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_fee_records_amount_positive check (amount > 0),
  constraint student_fee_records_due_date_check check (payment_date is null or payment_date <= due_date)
);

create index student_fee_records_student_idx
  on public.student_fee_records (student_id);

create index student_fee_records_campus_idx
  on public.student_fee_records (campus_id);

create index student_fee_records_organization_due_date_idx
  on public.student_fee_records (organization_id, due_date);

create index student_fee_records_status_idx
  on public.student_fee_records (status);

create trigger student_fee_records_updated_at_trigger
  before update on public.student_fee_records
  for each row
  execute procedure public.update_homework_assignments_updated_at();

alter table public.student_fee_records enable row level security;

create policy student_fee_records_select_admin
  on public.student_fee_records for select
  to authenticated
  using (public.is_org_admin(organization_id));

create policy student_fee_records_insert_admin
  on public.student_fee_records for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

create policy student_fee_records_update_admin
  on public.student_fee_records for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy student_fee_records_delete_admin
  on public.student_fee_records for delete
  to authenticated
  using (public.is_org_admin(organization_id));

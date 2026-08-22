alter table public.homework_assignments
add column if not exists student_id uuid;

alter table public.homework_assignments
drop constraint if exists homework_assignments_student_id_fkey;

alter table public.homework_assignments
add constraint homework_assignments_student_id_fkey
foreign key (student_id)
references public.students(id)
on delete restrict;

create index if not exists homework_assignments_student_idx
on public.homework_assignments(student_id);

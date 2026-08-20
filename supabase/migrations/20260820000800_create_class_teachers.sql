create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

create index class_teachers_teacher_idx
  on public.class_teachers (teacher_id);

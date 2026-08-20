create table public.campus_members (
  campus_id uuid not null references public.campuses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  campus_role text not null default 'teacher',
  created_at timestamptz not null default now(),
  primary key (campus_id, user_id),
  constraint campus_members_role_not_blank check (length(trim(campus_role)) > 0)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  status public.record_status not null default 'active',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint organization_members_organization_user_key unique (organization_id, user_id)
);

create index organization_members_organization_user_idx
  on public.organization_members (organization_id, user_id);

create index organization_members_user_role_idx
  on public.organization_members (user_id, role);

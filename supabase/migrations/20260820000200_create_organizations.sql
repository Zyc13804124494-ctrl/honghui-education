create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(trim(name)) > 0),
  constraint organizations_code_not_blank check (code is null or length(trim(code)) > 0)
);

insert into public.organizations (name, code)
values ('鸿慧教育', 'HONGHUI');

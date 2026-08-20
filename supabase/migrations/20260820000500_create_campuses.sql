create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  contact_phone text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_organization_name_key unique (organization_id, name),
  constraint campuses_organization_code_key unique (organization_id, code),
  constraint campuses_name_not_blank check (length(trim(name)) > 0),
  constraint campuses_code_not_blank check (length(trim(code)) > 0)
);

insert into public.campuses (organization_id, name, code)
select id, '站前校区', 'ZHANQIAN'
from public.organizations
where code = 'HONGHUI';

insert into public.campuses (organization_id, name, code)
select id, '高新校区', 'GAOXIN'
from public.organizations
where code = 'HONGHUI';

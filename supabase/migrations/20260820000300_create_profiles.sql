create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  real_name text,
  phone text unique,
  avatar_url text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_real_name_not_blank check (real_name is null or length(trim(real_name)) > 0),
  constraint profiles_phone_not_blank check (phone is null or length(trim(phone)) > 0)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, real_name, phone, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'real_name', '')), ''),
    nullif(trim(coalesce(new.phone, '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

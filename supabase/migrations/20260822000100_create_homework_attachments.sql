-- 作业图片附件表
-- 老师发布作业时上传的图片元数据，图片文件存放在 Storage bucket: homework-images
-- 不修改 homework_assignments 表结构

create table public.homework_attachments (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework_assignments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  sort_order int not null default 0,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint homework_attachments_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint homework_attachments_file_name_not_blank check (length(trim(file_name)) > 0)
);

create index homework_attachments_homework_idx
  on public.homework_attachments (homework_id, sort_order);

create index homework_attachments_organization_idx
  on public.homework_attachments (organization_id);

-- 启用 RLS
alter table public.homework_attachments enable row level security;

-- 读取：机构管理员或班级老师
create policy homework_attachments_select_authorized
  on public.homework_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = homework_attachments.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

-- 新增：机构管理员或班级老师
create policy homework_attachments_insert_authorized
  on public.homework_attachments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = homework_attachments.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

-- 删除：机构管理员或班级老师
create policy homework_attachments_delete_authorized
  on public.homework_attachments for delete
  to authenticated
  using (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = homework_attachments.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

-- 创建 public Storage bucket: homework-images
insert into storage.buckets (id, name, public)
values ('homework-images', 'homework-images', true)
on conflict (id) do nothing;

-- Storage 策略：允许已登录用户读取（public bucket 默认可读，这里显式声明）
create policy homework_images_select_public
  on storage.objects for select
  to authenticated
  using (bucket_id = 'homework-images');

-- Storage 策略：机构管理员或班级老师可上传
create policy homework_images_insert_authorized
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'homework-images'
    and exists (
      select 1
      from public.homework_assignments ha
      where ha.id = (storage.foldername(name))[1]::uuid
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

-- Storage 策略：机构管理员或班级老师可删除
create policy homework_images_delete_authorized
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'homework-images'
    and exists (
      select 1
      from public.homework_assignments ha
      where ha.id = (storage.foldername(name))[1]::uuid
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = public.current_user_id()
      and om.status = 'active'
  );
$$;

create or replace function public.is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = public.current_user_id()
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_org_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = public.current_user_id()
      and om.status = 'active'
      and om.role = 'owner'
  );
$$;

create or replace function public.is_campus_member(p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campuses c
    join public.campus_members cm on cm.campus_id = c.id
    where c.id = p_campus_id
      and cm.user_id = public.current_user_id()
      and (
        public.is_org_admin(c.organization_id)
        or cm.campus_role = 'teacher'
      )
  );
$$;

create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    join public.class_teachers ct on ct.class_id = c.id
    join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = ct.teacher_id
    join public.campus_members cm
      on cm.campus_id = c.campus_id
     and cm.user_id = public.current_user_id()
    where c.id = p_class_id
      and ct.teacher_id = public.current_user_id()
      and om.status = 'active'
      and om.role = 'teacher'
  );
$$;

revoke all on function public.current_user_id() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.is_org_owner(uuid) from public;
revoke all on function public.is_campus_member(uuid) from public;
revoke all on function public.is_class_teacher(uuid) from public;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.is_campus_member(uuid) to authenticated;
grant execute on function public.is_class_teacher(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.campuses enable row level security;
alter table public.campus_members enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.students enable row level security;
alter table public.student_class_enrollments enable row level security;
alter table public.homework_assignments enable row level security;
alter table public.student_homework_records enable row level security;
alter table public.correction_records enable row level security;

create policy organizations_select_member
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin
  on public.organizations for update
  to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy profiles_select_self_or_admin
  on public.profiles for select
  to authenticated
  using (
    id = public.current_user_id()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = profiles.id
        and public.is_org_admin(om.organization_id)
    )
  );

create policy profiles_update_self_or_admin
  on public.profiles for update
  to authenticated
  using (
    id = public.current_user_id()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = profiles.id
        and public.is_org_admin(om.organization_id)
    )
  )
  with check (
    id = public.current_user_id()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = profiles.id
        and public.is_org_admin(om.organization_id)
    )
  );

create policy organization_members_select_member
  on public.organization_members for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_insert_owner_or_admin
  on public.organization_members for insert
  to authenticated
  with check (
    public.is_org_owner(organization_id)
    or (
      public.is_org_admin(organization_id)
      and role = 'teacher'
    )
  );

create policy organization_members_update_owner_or_teacher_admin
  on public.organization_members for update
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or (
      public.is_org_admin(organization_id)
      and role = 'teacher'
    )
  )
  with check (
    public.is_org_owner(organization_id)
    or (
      public.is_org_admin(organization_id)
      and role = 'teacher'
    )
  );

create policy organization_members_delete_owner_or_teacher_admin
  on public.organization_members for delete
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or (
      public.is_org_admin(organization_id)
      and role = 'teacher'
    )
  );

create policy campuses_select_authorized
  on public.campuses for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.is_campus_member(id)
  );

create policy campuses_insert_admin
  on public.campuses for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

create policy campuses_update_admin
  on public.campuses for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy campuses_delete_admin
  on public.campuses for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create policy campus_members_select_authorized
  on public.campus_members for select
  to authenticated
  using (
    user_id = public.current_user_id()
    or exists (
      select 1
      from public.campuses c
      where c.id = campus_members.campus_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy campus_members_insert_admin
  on public.campus_members for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.campuses c
      where c.id = campus_members.campus_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy campus_members_update_admin
  on public.campus_members for update
  to authenticated
  using (
    exists (
      select 1
      from public.campuses c
      where c.id = campus_members.campus_id
        and public.is_org_admin(c.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.campuses c
      where c.id = campus_members.campus_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy campus_members_delete_admin
  on public.campus_members for delete
  to authenticated
  using (
    exists (
      select 1
      from public.campuses c
      where c.id = campus_members.campus_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy classes_select_authorized
  on public.classes for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(id)
  );

create policy classes_insert_admin
  on public.classes for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

create policy classes_update_admin
  on public.classes for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy classes_delete_admin
  on public.classes for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create policy class_teachers_select_authorized
  on public.class_teachers for select
  to authenticated
  using (
    teacher_id = public.current_user_id()
    or exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy class_teachers_insert_admin
  on public.class_teachers for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy class_teachers_update_admin
  on public.class_teachers for update
  to authenticated
  using (
    exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and public.is_org_admin(c.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy class_teachers_delete_admin
  on public.class_teachers for delete
  to authenticated
  using (
    exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and public.is_org_admin(c.organization_id)
    )
  );

create policy students_select_authorized
  on public.students for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or exists (
      select 1
      from public.student_class_enrollments sce
      where sce.student_id = students.id
        and sce.is_current
        and public.is_class_teacher(sce.class_id)
    )
  );

create policy students_insert_admin
  on public.students for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

create policy students_update_authorized
  on public.students for update
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or exists (
      select 1
      from public.student_class_enrollments sce
      where sce.student_id = students.id
        and sce.is_current
        and public.is_class_teacher(sce.class_id)
    )
  )
  with check (
    public.is_org_admin(organization_id)
    or exists (
      select 1
      from public.student_class_enrollments sce
      where sce.student_id = students.id
        and sce.is_current
        and public.is_class_teacher(sce.class_id)
    )
  );

create policy students_delete_admin
  on public.students for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create policy student_class_enrollments_select_authorized
  on public.student_class_enrollments for select
  to authenticated
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_class_enrollments.student_id
        and public.is_org_admin(s.organization_id)
    )
    or public.is_class_teacher(class_id)
  );

create policy student_class_enrollments_insert_authorized
  on public.student_class_enrollments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.students s
      where s.id = student_class_enrollments.student_id
        and (
          public.is_org_admin(s.organization_id)
          or public.is_class_teacher(class_id)
        )
    )
  );

create policy student_class_enrollments_update_authorized
  on public.student_class_enrollments for update
  to authenticated
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_class_enrollments.student_id
        and (
          public.is_org_admin(s.organization_id)
          or public.is_class_teacher(class_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.students s
      where s.id = student_class_enrollments.student_id
        and (
          public.is_org_admin(s.organization_id)
          or public.is_class_teacher(class_id)
        )
    )
  );

create policy student_class_enrollments_delete_admin
  on public.student_class_enrollments for delete
  to authenticated
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_class_enrollments.student_id
        and public.is_org_admin(s.organization_id)
    )
  );

create policy homework_assignments_select_authorized
  on public.homework_assignments for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(class_id)
  );

create policy homework_assignments_insert_authorized
  on public.homework_assignments for insert
  to authenticated
  with check (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(class_id)
  );

create policy homework_assignments_update_authorized
  on public.homework_assignments for update
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(class_id)
  )
  with check (
    public.is_org_admin(organization_id)
    or public.is_class_teacher(class_id)
  );

create policy homework_assignments_delete_admin
  on public.homework_assignments for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create policy student_homework_records_select_authorized
  on public.student_homework_records for select
  to authenticated
  using (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = student_homework_records.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

create policy student_homework_records_insert_authorized
  on public.student_homework_records for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = student_homework_records.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

create policy student_homework_records_update_authorized
  on public.student_homework_records for update
  to authenticated
  using (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = student_homework_records.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = student_homework_records.homework_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

create policy correction_records_select_authorized
  on public.correction_records for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_homework_records shr
      join public.homework_assignments ha on ha.id = shr.homework_id
      where shr.id = correction_records.homework_record_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

create policy correction_records_insert_authorized
  on public.correction_records for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.student_homework_records shr
      join public.homework_assignments ha on ha.id = shr.homework_id
      where shr.id = correction_records.homework_record_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

create policy correction_records_update_authorized
  on public.correction_records for update
  to authenticated
  using (
    exists (
      select 1
      from public.student_homework_records shr
      join public.homework_assignments ha on ha.id = shr.homework_id
      where shr.id = correction_records.homework_record_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.student_homework_records shr
      join public.homework_assignments ha on ha.id = shr.homework_id
      where shr.id = correction_records.homework_record_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

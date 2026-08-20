create or replace function public.can_access_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    left join public.student_class_enrollments sce
      on sce.student_id = s.id
     and sce.is_current
    left join public.classes c on c.id = sce.class_id
    where s.id = p_student_id
      and (
        public.is_org_admin(s.organization_id)
        or (
          s.organization_id = c.organization_id
          and s.campus_id = c.campus_id
          and public.is_class_teacher(c.id)
        )
      )
  );
$$;

create or replace function public.can_access_student_enrollment(
  p_student_id uuid,
  p_class_id uuid,
  p_campus_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.classes c on c.id = p_class_id
    where s.id = p_student_id
      and s.organization_id = c.organization_id
      and s.campus_id = c.campus_id
      and p_campus_id = c.campus_id
      and (
        public.is_org_admin(c.organization_id)
        or public.is_class_teacher(c.id)
      )
  );
$$;

revoke all on function public.can_access_student(uuid) from public;
revoke all on function public.can_access_student_enrollment(uuid, uuid, uuid) from public;
grant execute on function public.can_access_student(uuid) to authenticated;
grant execute on function public.can_access_student_enrollment(uuid, uuid, uuid) to authenticated;

drop policy if exists students_select_authorized on public.students;
drop policy if exists students_update_authorized on public.students;

create policy students_select_authorized
  on public.students for select
  to authenticated
  using (public.can_access_student(id));

create policy students_update_authorized
  on public.students for update
  to authenticated
  using (public.can_access_student(id))
  with check (public.can_access_student(id));

drop policy if exists student_class_enrollments_select_authorized
  on public.student_class_enrollments;

create policy student_class_enrollments_select_authorized
  on public.student_class_enrollments for select
  to authenticated
  using (
    public.can_access_student_enrollment(student_id, class_id, campus_id)
  );

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
    join public.campus_members cm
      on cm.campus_id = c.id
     and cm.user_id = public.current_user_id()
     and cm.campus_role = 'teacher'
    join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = public.current_user_id()
     and om.status = 'active'
     and om.role = 'teacher'
    where c.id = p_campus_id
  );
$$;

revoke all on function public.is_campus_member(uuid) from public;
grant execute on function public.is_campus_member(uuid) to authenticated;

drop policy if exists student_class_enrollments_insert_authorized
  on public.student_class_enrollments;
drop policy if exists student_class_enrollments_update_authorized
  on public.student_class_enrollments;

create policy student_class_enrollments_insert_authorized
  on public.student_class_enrollments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.students s
      join public.classes c on c.id = student_class_enrollments.class_id
      where s.id = student_class_enrollments.student_id
        and s.organization_id = c.organization_id
        and s.campus_id = c.campus_id
        and student_class_enrollments.campus_id = c.campus_id
        and student_class_enrollments.campus_id = s.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
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
      join public.classes c on c.id = student_class_enrollments.class_id
      where s.id = student_class_enrollments.student_id
        and s.organization_id = c.organization_id
        and s.campus_id = c.campus_id
        and student_class_enrollments.campus_id = c.campus_id
        and student_class_enrollments.campus_id = s.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.students s
      join public.classes c on c.id = student_class_enrollments.class_id
      where s.id = student_class_enrollments.student_id
        and s.organization_id = c.organization_id
        and s.campus_id = c.campus_id
        and student_class_enrollments.campus_id = c.campus_id
        and student_class_enrollments.campus_id = s.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
        )
    )
  );

drop policy if exists homework_assignments_insert_authorized
  on public.homework_assignments;
drop policy if exists homework_assignments_update_authorized
  on public.homework_assignments;

create policy homework_assignments_insert_authorized
  on public.homework_assignments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.classes c
      where c.id = homework_assignments.class_id
        and c.organization_id = homework_assignments.organization_id
        and c.campus_id = homework_assignments.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
        )
    )
  );

create policy homework_assignments_update_authorized
  on public.homework_assignments for update
  to authenticated
  using (
    exists (
      select 1
      from public.classes c
      where c.id = homework_assignments.class_id
        and c.organization_id = homework_assignments.organization_id
        and c.campus_id = homework_assignments.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.classes c
      where c.id = homework_assignments.class_id
        and c.organization_id = homework_assignments.organization_id
        and c.campus_id = homework_assignments.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
        )
    )
  );

drop policy if exists student_homework_records_insert_authorized
  on public.student_homework_records;
drop policy if exists student_homework_records_update_authorized
  on public.student_homework_records;

create policy student_homework_records_insert_authorized
  on public.student_homework_records for insert
  to authenticated
  with check (
    recorded_by = public.current_user_id()
    and exists (
      select 1
      from public.homework_assignments ha
      join public.students s on s.id = student_homework_records.student_id
      join public.student_class_enrollments sce
        on sce.student_id = s.id
       and sce.class_id = ha.class_id
       and sce.is_current
      where ha.id = student_homework_records.homework_id
        and s.organization_id = ha.organization_id
        and s.campus_id = ha.campus_id
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
      join public.students s on s.id = student_homework_records.student_id
      join public.student_class_enrollments sce
        on sce.student_id = s.id
       and sce.class_id = ha.class_id
       and sce.is_current
      where ha.id = student_homework_records.homework_id
        and s.organization_id = ha.organization_id
        and s.campus_id = ha.campus_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  )
  with check (
    recorded_by = public.current_user_id()
    and exists (
      select 1
      from public.homework_assignments ha
      join public.students s on s.id = student_homework_records.student_id
      join public.student_class_enrollments sce
        on sce.student_id = s.id
       and sce.class_id = ha.class_id
       and sce.is_current
      where ha.id = student_homework_records.homework_id
        and s.organization_id = ha.organization_id
        and s.campus_id = ha.campus_id
        and (
          public.is_org_admin(ha.organization_id)
          or public.is_class_teacher(ha.class_id)
        )
    )
  );

drop policy if exists correction_records_insert_authorized
  on public.correction_records;
drop policy if exists correction_records_update_authorized
  on public.correction_records;

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
          or (
            public.is_class_teacher(ha.class_id)
            and correction_records.reviewer_id = public.current_user_id()
          )
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
          or (
            public.is_class_teacher(ha.class_id)
            and correction_records.reviewer_id = public.current_user_id()
          )
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
          or (
            public.is_class_teacher(ha.class_id)
            and correction_records.reviewer_id = public.current_user_id()
          )
        )
    )
  );

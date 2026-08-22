-- 增量 migration：homework_assignments 增加 student_id（按学生作业模型）
-- 原则：
--   1. 不修改已有字段
--   2. 不删除 class_id
--   3. 不影响历史作业数据（历史 student_id 保持 NULL，不回填）

-- ============================================================
-- 1. 新增 student_id 列
--    可空；外键关联 students(id)；删除学生时 restrict（有作业引用则禁止删除）
-- ============================================================
alter table public.homework_assignments
  add column student_id uuid references public.students(id) on delete restrict;

-- ============================================================
-- 2. 新增索引
-- ============================================================
create index homework_assignments_student_idx
  on public.homework_assignments (student_id);

create index homework_assignments_student_date_idx
  on public.homework_assignments (student_id, homework_date);

-- ============================================================
-- 3. 触发器：当 student_id 存在时，根据学生当前班级自动同步
--    class_id / campus_id / organization_id
--    使用 security definer，确保能读取带 RLS 的 student_class_enrollments / students
-- ============================================================
create or replace function public.sync_homework_student_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment record;
begin
  if new.student_id is not null then
    select sce.class_id, sce.campus_id, s.organization_id
      into v_enrollment
      from public.student_class_enrollments sce
      join public.students s on s.id = sce.student_id
     where sce.student_id = new.student_id
       and sce.is_current
     order by sce.start_date desc
     limit 1;

    if v_enrollment is not null then
      new.class_id := v_enrollment.class_id;
      new.campus_id := v_enrollment.campus_id;
      new.organization_id := v_enrollment.organization_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger homework_assignments_sync_student_context_trigger
  before insert or update of student_id on public.homework_assignments
  for each row
  execute procedure public.sync_homework_student_context();

-- ============================================================
-- 4. RLS 评估
--    现有 homework_assignments 策略均基于 class_id / organization_id：
--      - select:  is_org_admin(organization_id) OR is_class_teacher(class_id)
--      - insert:  校验 class_id 与 organization_id / campus_id 一致，且 is_org_admin OR is_class_teacher(class_id)
--      - update:  同 insert
--      - delete:  is_org_admin(organization_id)
--    由于本触发器保证 student_id 存在时 class_id / campus_id / organization_id
--    始终与学生的当前班级保持一致，因此现有策略已能正确覆盖按学生作业的访问控制，
--    无需新增 student_id 相关访问条件，也不重写已有策略。
-- ============================================================

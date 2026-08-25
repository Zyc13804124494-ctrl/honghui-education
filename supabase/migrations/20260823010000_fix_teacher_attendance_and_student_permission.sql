-- ============================================================
-- P0 上线阻断项修复：老师考勤 + 学生权限 + 历史幽灵绑定清理
--
-- 说明：
--   仅修改 RLS 策略 + 新增一个保护触发器 + 一次性数据修复。
--   不修改任何表结构、不改字段、不使用 CASCADE。
--
-- 具体修复：
--   1) 老师可新增考勤（insert）：放开给 is_org_admin 或 is_class_teacher
--   2) 非管理员禁止修改学生 status / deleted_at（防止老师 API 置离校）
--   3) 清理已离校学生的 is_current=true 幽灵绑定
-- ============================================================

-- ============================================================
-- 修复 1：student_attendance_records insert 允许任课老师
-- 条件：is_org_admin(organization_id) OR is_class_teacher(class_id)
-- 并保留 班级/学生的机构与校区一致性校验
-- ============================================================
drop policy if exists student_attendance_records_insert_admin on public.student_attendance_records;

create policy student_attendance_records_insert_authorized
  on public.student_attendance_records for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.classes c
      join public.students s on s.id = student_attendance_records.student_id
      where c.id = student_attendance_records.class_id
        and c.organization_id = student_attendance_records.organization_id
        and c.campus_id = student_attendance_records.campus_id
        and s.organization_id = student_attendance_records.organization_id
        and s.campus_id = student_attendance_records.campus_id
        and (
          public.is_org_admin(c.organization_id)
          or public.is_class_teacher(c.id)
        )
    )
  );

-- ============================================================
-- 修复 2：保护学生生命周期字段
-- status / deleted_at 仅 owner/admin 可改，任课老师不可改。
-- 通过 BEFORE UPDATE 触发器强制（RLS 无法对比 OLD/NEW 行）。
-- 不新增/删除列，不影响既有 RLS 策略。
-- ============================================================
create or replace function public.protect_student_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    NEW.status is distinct from OLD.status
    or NEW.deleted_at is distinct from OLD.deleted_at
  ) and not public.is_org_admin(OLD.organization_id) then
    raise exception '只有管理员可修改学生的离校状态或删除标记';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_student_lifecycle_fields_trigger on public.students;

create trigger protect_student_lifecycle_fields_trigger
  before update on public.students
  for each row
  execute procedure public.protect_student_lifecycle_fields();

-- ============================================================
-- 修复 3：清理已离校学生的「当前班级」幽灵绑定（一次性数据修复）
-- 仅处理异常数据：status='left' 或 deleted_at 非空，但仍 is_current=true
-- ============================================================
update public.student_class_enrollments sce
set is_current = false,
    end_date = now()::date
from public.students s
where sce.student_id = s.id
  and sce.is_current = true
  and (s.status = 'left' or s.deleted_at is not null);

-- ============================================================
-- 回滚（down）：
--   1) drop policy if exists student_attendance_records_insert_authorized
--      on public.student_attendance_records;
--      -- 如需恢复原状，可重建 admin 专属 insert 策略（见迁移 20260820001700）
--   2) drop trigger if exists protect_student_lifecycle_fields_trigger on public.students;
--      drop function if exists public.protect_student_lifecycle_fields();
--   3) 数据修复不可回滚（已变更的历史绑定不再恢复）。
-- ============================================================

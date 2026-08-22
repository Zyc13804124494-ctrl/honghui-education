-- ============================================================
-- 将 students 学号唯一约束从「全局唯一」改为「仅在校学生唯一」
--
-- 目标：
--   现在：organization_id + student_no 全局唯一
--   改为：仅在校学生唯一（status <> 'left' 且 deleted_at is null）
--
-- 效果：
--   - 在校学生不能重复学号
--   - 已离校学生（status='left' 或 deleted_at 非空）不占用学号，可重新录入
--
-- 原则：
--   1. 不修改 students 表结构（仅删除约束、新增索引，不改列）
--   2. 不删除历史学生
--   3. 不影响已有数据（旧约束保证在校学生无重复，索引创建安全）
--   4. 可回滚（见文件底部 down 注释）
-- ============================================================

-- ============================================================
-- 1. 删除旧的全局唯一约束
-- ============================================================
alter table public.students
  drop constraint if exists students_organization_student_no_key;

-- ============================================================
-- 2. 新增部分唯一索引：仅在校学生学号唯一
--    条件：status <> 'left' 且 deleted_at is null
-- ============================================================
create unique index if not exists students_org_student_no_active_key
  on public.students (organization_id, student_no)
  where status <> 'left' and deleted_at is null;

-- ============================================================
-- 回滚（down）：
--   drop index if exists public.students_org_student_no_active_key;
--   alter table public.students
--     add constraint students_organization_student_no_key
--     unique (organization_id, student_no);
-- ============================================================

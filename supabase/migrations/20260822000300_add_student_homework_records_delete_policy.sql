-- 为 student_homework_records 增加 delete RLS 策略
-- 允许机构管理员（owner / admin）删除对应作业的完成记录
-- 仅新增策略，不修改已有策略，保持现有 RLS 逻辑不变

create policy student_homework_records_delete_admin
  on public.student_homework_records for delete
  to authenticated
  using (
    exists (
      select 1
      from public.homework_assignments ha
      where ha.id = student_homework_records.homework_id
        and public.is_org_admin(ha.organization_id)
    )
  );

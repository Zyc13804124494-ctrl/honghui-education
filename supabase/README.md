# Supabase 初始化说明

1. 在 Supabase Dashboard 创建项目。
2. 复制项目 URL 和 anon key 到项目根目录的 `.env.local`：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. 后续数据库表结构和 RLS 策略将以 migration 文件形式添加到 `supabase/migrations/`。

注意：不要把 `service_role` key 写入前端环境变量或提交到代码仓库。

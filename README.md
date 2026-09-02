# 鸿慧教育管理平台

基于 Vite + Supabase + PWA 的托管机构管理平台，覆盖校区、班级、学生、作业、考勤、批改与教师移动工作流。

## 技术栈
- 前端：Vite + 原生 JS（单页应用）
- 数据：Supabase（PostgreSQL + Auth + Storage）
- 服务端：Supabase Edge Functions（Deno）
- PWA：manifest + Service Worker（离线缓存）

## 本地开发
1. 安装依赖：
   ```bash
   npm install
   ```
2. 配置环境变量（复制 `.env.example` 为 `.env.local` 并填写）：
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```
3. 启动：
   ```bash
   npm run dev
   ```
4. 打开 http://localhost:5173

## 环境变量
| 变量 | 说明 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 项目地址 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key（anon key，可暴露在客户端） |

> ⚠️ `service_role key` 仅用于 Supabase Edge Functions（服务端 `Deno.env`），切勿写入任何 `VITE_*` 变量或前端代码。

## 部署到 Vercel
1. 将项目推送到 Git 仓库（GitHub/GitLab）。
2. 在 Vercel 导入该仓库，框架自动识别为 Vite。
3. 在 Vercel 项目 Settings → Environment Variables 配置：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. 部署配置已内置 `vercel.json`：
   - Build Command：`npm run build`
   - Output Directory：`dist`
   - SPA rewrites 已配置（刷新不会 404）
5. 部署完成后，将站点域名加入 Supabase 的 Authentication → URL Configuration（Site URL / Redirect URLs）。

## Edge Functions 部署
```bash
supabase functions deploy create-teacher
supabase functions deploy login-email
supabase functions deploy reset-teacher-password
```

## PWA
- `public/manifest.webmanifest`、`public/sw.js`、图标均在构建后输出到 `dist/`。
- Service Worker 仅在 HTTPS（生产）生效，支持离线缓存与网络恢复自动更新。


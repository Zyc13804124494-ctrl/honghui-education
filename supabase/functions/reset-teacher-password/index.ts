// Edge Function: reset-teacher-password
// 仅 owner/admin 可重置教师 Auth 密码。
// 使用 supabase.auth.admin.updateUserById(user_id, { password }) —— 只改 auth.users 密码，
// 不改 user_id / profiles / organization_members / campus_members / class_teachers，
// 不删除历史数据。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1) 解析调用者 JWT
    const reqJwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(reqJwt)
    if (callerErr || !caller) return json(401, { error: '未登录或会话无效', detail: callerErr?.message || 'JWT 无效或已过期' })

    // 2) 仅 owner/admin 可调用
    const { data: myMembers, error: membersErr } = await supabase.from('organization_members').select('organization_id, role, status').eq('user_id', caller.id).eq('status', 'active')
    if (membersErr) return json(500, { error: '读取成员关系失败', detail: membersErr.message })
    const adminRow = (myMembers || []).find((m) => m.role === 'owner' || m.role === 'admin')
    if (!adminRow) return json(403, { error: '无权限', detail: '仅机构管理员可重置教师密码' })

    // 3) 入参
    const body = await req.json()
    const userId = String(body.user_id || '')
    const password = String(body.password || '')
    if (!userId) return json(400, { error: '缺少 user_id', detail: '必须提供要重置密码的教师 user_id' })
    if (!password || password.length < 6) return json(400, { error: '新密码不合法', detail: '至少 6 位' })

    // 4) 重置密码（supabase-js v2 admin.updateUserById 返回 { data, error }）
    const { error } = await supabase.auth.admin.updateUserById(userId, { password })
    if (error) {
      const err = { error: '重置密码失败', detail: error.message }
      console.error('[reset-teacher-password] FAIL', JSON.stringify(err))
      return json(400, err)
    }
    console.log('[reset-teacher-password] SUCCESS userId:', userId)
    return json(200, { ok: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return json(500, { error: '服务器错误', detail })
  }
})

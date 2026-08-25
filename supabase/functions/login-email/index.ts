// Edge Function：login-email
// 手机号登录辅助：根据 profiles.phone 查询对应 auth user 的真实 email。
// 目的：兼容两种账号
//   - 新创建教师：auth email = {phone}@teacher.honghui.local（虚拟邮箱）
//   - 老 owner/admin：auth email = 其真实邮箱（保持不变）
// 前端拿到真实 email 后再调用 signInWithPassword(email, password)。
// 使用 service_role 读取 auth.users（anon 无法读取），密钥仅服务端可见。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json()
    const phone = String(body.phone || '').trim()
    if (!phone) return json(400, { error: '手机号不能为空' })

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    // 1) 按手机号查 profiles → user_id
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (pErr) return json(500, { error: '查询失败' })
    if (!profile) return json(200, { email: null })

    // 2) 通过 user_id 获取该用户真实 auth email
    const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(profile.id)
    if (uErr || !userData?.user?.email) return json(200, { email: null })

    return json(200, { email: userData.user.email })
  } catch (err) {
    return json(500, { error: `服务器错误：${err instanceof Error ? err.message : String(err)}` })
  }
})

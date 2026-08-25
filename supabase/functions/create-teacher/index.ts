// Edge Function：create-teacher
// 由 owner/admin 在「教师管理」后台创建教师账号。
// 使用 service_role（仅此处服务端可见，不外泄到前端 bundle）。
// 流程：校验调用者为机构管理员 → auth.admin.createUser 创建可登录用户
//      → 建 profiles / organization_members(role='teacher') / campus_members / class_teachers
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
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    // 1) 校验调用者是机构管理员（owner/admin）——用调用者的 JWT 解析身份
    const reqJwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(reqJwt)
    if (callerErr || !caller) return json(401, { error: '未登录或会话无效' })

    const { data: myMembers, error: membersErr } = await supabase
      .from('organization_members')
      .select('organization_id, role, status')
      .eq('user_id', caller.id)
      .eq('status', 'active')
    if (membersErr) return json(500, { error: '读取成员关系失败' })
    const adminRow = (myMembers || []).find((m) => m.role === 'owner' || m.role === 'admin')
    if (!adminRow) return json(403, { error: '仅机构管理员可创建教师' })
    const organizationId = adminRow.organization_id

    // 2) 读取入参
    const body = await req.json()
    const realName = String(body.real_name || '').trim()
    const phone = String(body.phone || '').trim()
    const password = String(body.password || '')
    const campusId = String(body.campus_id || '')
    const classIds = Array.isArray(body.class_ids) ? body.class_ids.map(String) : []
    if (!realName || !phone || !password) return json(400, { error: '姓名、手机号、初始密码为必填' })
    if (!campusId) return json(400, { error: '请选择所属校区' })
    // 内部虚拟邮箱：仅用于 Auth 登录，不展示给用户（Supabase 密码登录依赖 email）
    const virtualEmail = `${phone}@teacher.honghui.local`

    // 3) 创建 auth 用户（可登录），用虚拟邮箱
    const { data: user, error: createErr } = await supabase.auth.admin.createUser({
      email: virtualEmail,
      password,
      phone,
      email_confirm: true,
      user_metadata: { real_name: realName },
    })
    if (createErr) return json(400, { error: `创建登录账号失败：${createErr.message}` })
    const userId = user.id

    // 4) profiles（通常由 handle_new_user 触发器自动创建，这里再次确保存在）
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert({ id: userId, real_name: realName, phone }, { onConflict: 'id' })
    if (profileErr) return json(500, { error: `创建个人信息失败：${profileErr.message}` })

    // 5) organization_members(role='teacher')
    const { error: orgMemberErr } = await supabase
      .from('organization_members')
      .insert({ organization_id: organizationId, user_id: userId, role: 'teacher', status: 'active' })
    if (orgMemberErr) return json(500, { error: `创建机构成员失败：${orgMemberErr.message}` })

    // 6) campus_members
    const { error: campusMemberErr } = await supabase
      .from('campus_members')
      .insert({ campus_id: campusId, user_id: userId, campus_role: 'teacher' })
    if (campusMemberErr) return json(500, { error: `创建校区成员失败：${campusMemberErr.message}` })

    // 7) class_teachers（可多班；无班级时跳过）
    if (classIds.length) {
      const rows = [...new Set(classIds)].map((classId) => ({ class_id: classId, teacher_id: userId, is_primary: false }))
      const { error: classTeacherErr } = await supabase.from('class_teachers').insert(rows)
      if (classTeacherErr) return json(500, { error: `创建班级任教失败：${classTeacherErr.message}` })
    }

    return json(200, { ok: true, teacher_id: userId })
  } catch (err) {
    return json(500, { error: `服务器错误：${err instanceof Error ? err.message : String(err)}` })
  }
})

// Edge Function: create-teacher（带逐步 console.log 便于定位故障）
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
    // 1) 管理员 JWT
    const reqJwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    console.log('[create-teacher] jwt present:', Boolean(reqJwt))
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(reqJwt)
    console.log('[create-teacher] getUser callerErr:', callerErr ? JSON.stringify(callerErr) : 'null', 'callerId:', caller?.id || 'null')
    if (callerErr || !caller) return json(401, { error: '未登录或会话无效', detail: callerErr?.message || 'JWT 无效或已过期' })
    // 2) 管理员身份
    const { data: myMembers, error: membersErr } = await supabase.from('organization_members').select('organization_id, role, status').eq('user_id', caller.id).eq('status', 'active')
    console.log('[create-teacher] memberCheck error:', membersErr ? JSON.stringify(membersErr) : 'null', 'members:', JSON.stringify(myMembers || null))
    if (membersErr) return json(500, { error: '读取成员关系失败', detail: membersErr.message })
    const adminRow = (myMembers || []).find((m) => m.role === 'owner' || m.role === 'admin')
    if (!adminRow) return json(403, { error: '仅机构管理员可创建教师', detail: '当前账号非 owner/admin' })
    const organizationId = adminRow.organization_id
    console.log('[create-teacher] admin ok orgId:', organizationId)
    // 3) 入参
    const body = await req.json()
    console.log('[create-teacher] body:', JSON.stringify({ ...body, password: body.password ? '***' : body.password }))
    const realName = String(body.real_name || '').trim()
    const phone = String(body.phone || '').trim()
    const password = String(body.password || '')
    const campusId = String(body.campus_id || '')
    const classIds = Array.isArray(body.class_ids) ? body.class_ids.map(String) : []
    if (!realName || !phone || !password) {
      const err = { error: '姓名、手机号、初始密码为必填', detail: `real_name=${JSON.stringify(realName)} phone=${JSON.stringify(phone)} hasPwd=${Boolean(password)}` }
      console.log('[create-teacher] FAIL validation', JSON.stringify(err)); return json(400, err)
    }
    if (!campusId) {
      const err = { error: '请选择所属校区', detail: `campus_id=${JSON.stringify(campusId)}` }
      console.log('[create-teacher] FAIL campus missing', JSON.stringify(err)); return json(400, err)
    }
    // 3.5) 新增前检查手机号是否已注册（profiles.phone 唯一；organization_members.user_id -> profiles.id）
    const { data: existingProfile, error: phoneCheckErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    console.log('[create-teacher] phoneCheck error:', phoneCheckErr ? JSON.stringify(phoneCheckErr) : 'null', 'existingProfileId:', existingProfile?.id || 'null')
    if (phoneCheckErr) {
      const err = { error: '检查手机号失败', detail: phoneCheckErr.message }
      console.log('[create-teacher] FAIL phoneCheck', JSON.stringify(err)); return json(500, err)
    }
    if (existingProfile) {
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('status')
        .eq('user_id', existingProfile.id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (existingMember?.status === 'archived') {
        const err = { error: '该手机号对应的教师账号已归档，请在已归档列表中恢复原教师账号，或使用其他手机号', detail: `phone=${JSON.stringify(phone)}` }
        console.log('[create-teacher] FAIL phone archived', JSON.stringify(err)); return json(409, err)
      }
      const err = { error: '该手机号已注册，请使用其他手机号', detail: `phone=${JSON.stringify(phone)}` }
      console.log('[create-teacher] FAIL phone exists', JSON.stringify(err)); return json(409, err)
    }
    const virtualEmail = `${phone}@teacher.honghui.local`
    console.log('[create-teacher] virtualEmail:', virtualEmail)
    // 4) createUser —— 返回结构为 { data: { user }, error }，用户 id 为 data.user.id
    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({ email: virtualEmail, password, phone, email_confirm: true, user_metadata: { real_name: realName } })
    console.log('[create-teacher] createUser error:', createErr ? JSON.stringify(createErr) : 'null', 'createdUserId:', createData?.user?.id || 'null')
    if (createErr) {
      const err = { error: '创建登录账号失败', detail: createErr.message }
      console.log('[create-teacher] FAIL createUser', JSON.stringify(err)); return json(400, err)
    }
    const userId = createData?.user?.id
    if (!userId) {
      const err = { error: '创建登录账号异常', detail: `auth.admin.createUser 返回体异常 data=${JSON.stringify(createData)}` }
      console.log('[create-teacher] FAIL missing userId', JSON.stringify(err)); return json(500, err)
    }
    // 5) profiles：id 必须 = auth.users.id（user.id）
    //    id 无默认值且为 PK，缺 id 会报 not-null。先删除触发器可能残留/占位的该 id 行，再显式插入/更新
    const { error: preDelErr } = await supabase.from('profiles').delete().eq('id', userId)
    console.log('[create-teacher] profiles pre-delete error:', preDelErr ? JSON.stringify(preDelErr) : 'null')
    if (preDelErr) {
      const err = { error: '清理个人信息失败', detail: preDelErr.message }
      console.log('[create-teacher] FAIL profiles preDelete', JSON.stringify(err)); return json(500, err)
    }
    const { error: profileErr } = await supabase.from('profiles').insert({ id: userId, real_name: realName, phone })
    console.log('[create-teacher] profiles insert error:', profileErr ? JSON.stringify(profileErr) : 'null')
    if (profileErr) {
      const err = { error: '创建个人信息失败', detail: profileErr.message }
      console.log('[create-teacher] FAIL profiles', JSON.stringify(err)); return json(500, err)
    }
    // 6) organization_members
    const { error: orgErr } = await supabase.from('organization_members').insert({ organization_id: organizationId, user_id: userId, role: 'teacher', status: 'active' })
    console.log('[create-teacher] org_members error:', orgErr ? JSON.stringify(orgErr) : 'null')
    if (orgErr) {
      const err = { error: '创建机构成员失败', detail: orgErr.message }
      console.log('[create-teacher] FAIL org_members', JSON.stringify(err)); return json(500, err)
    }
    // 7) campus_members
    const { error: campusErr } = await supabase.from('campus_members').insert({ campus_id: campusId, user_id: userId, campus_role: 'teacher' })
    console.log('[create-teacher] campus_members error:', campusErr ? JSON.stringify(campusErr) : 'null')
    if (campusErr) {
      const err = { error: '创建校区成员失败', detail: campusErr.message }
      console.log('[create-teacher] FAIL campus_members', JSON.stringify(err)); return json(500, err)
    }
    // 8) class_teachers
    if (classIds.length) {
      const rows = [...new Set(classIds)].map((classId) => ({ class_id: classId, teacher_id: userId, is_primary: false }))
      const { error: ctErr } = await supabase.from('class_teachers').insert(rows)
      console.log('[create-teacher] class_teachers error:', ctErr ? JSON.stringify(ctErr) : 'null')
      if (ctErr) {
        const err = { error: '创建班级任教失败', detail: ctErr.message }
        console.log('[create-teacher] FAIL class_teachers', JSON.stringify(err)); return json(500, err)
      }
    }
    console.log('[create-teacher] SUCCESS teacher_id:', userId)
    return json(200, { ok: true, teacher_id: userId })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[create-teacher] uncaught', detail, err instanceof Error ? err.stack : '')
    return json(500, { error: '服务器错误', detail })
  }
})


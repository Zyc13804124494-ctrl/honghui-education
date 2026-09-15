import './style.css'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'

const sections = {
  home: { label: '首页', eyebrow: '管理总览', title: '鸿慧教育管理后台', description: '掌握两个校区的教学运营状态。' },
  campuses: { label: '校区管理', eyebrow: '组织架构', title: '校区管理', description: '查看鸿慧教育的校区信息。' },
  classes: { label: '班级管理', eyebrow: '教学组织', title: '班级管理', description: '查看各校区的班级安排。' },
  teachers: { label: '教师管理', eyebrow: '团队成员', title: '教师管理', description: '查看机构内的教师与授权范围。' },
  students: { label: '学生管理', eyebrow: '学生档案', title: '学生管理', description: '查看当前机构的学生档案。' },
  homework: { label: '作业管理', eyebrow: '学习进度', title: '作业管理', description: '查看班级作业发布情况。' },
  corrections: { label: '批改记录', eyebrow: '教学反馈', title: '批改记录', description: '查看老师的作业批改记录。' },
  attendance: { label: '考勤管理', eyebrow: '每日出勤', title: '考勤管理', description: '记录和查看班级每日出勤情况。' },
  settings: { label: '系统设置', eyebrow: '系统管理', title: '系统设置', description: '成员管理、个人中心与操作日志。' }
}

const navigation = [
  ['home', '⌂'], ['campuses', '⌑'], ['classes', '▦'], ['teachers', '♧'],
  ['students', '♙'], ['homework', '✓'], ['attendance', '◷'], ['corrections', '✎'],
  ['settings', '⚙']
]

let activeSection = 'home'
let appContext = null
let mobileMoreOpen = false
let teacherClassCache = []
let batchImportValidRows = []
let teacherListFilter = 'active'

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
const formatDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value)) : '—'
const isValidUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const roleLabel = { owner: '超级管理员', admin: '管理员', teacher: '老师' }

// 统一权限矩阵：action -> 允许的角色
// owner: 全部；admin: 业务管理；teacher: 仅查看自己班级、发布作业、操作考勤
const permissionMatrix = {
  manage_student: ['owner', 'admin'],
  create_student: ['owner', 'admin'],
  edit_student: ['owner', 'admin'],
  leave_student: ['owner', 'admin'],
  manage_class: ['owner', 'admin'],
  create_class: ['owner', 'admin'],
  edit_class: ['owner', 'admin'],
  disable_class: ['owner', 'admin'],
  archive_class: ['owner', 'admin'],
  cleanup_class: ['owner', 'admin'],
  delete_class: ['owner', 'admin'],
  create_homework: ['owner', 'admin', 'teacher'],
  correct_homework: ['owner', 'admin', 'teacher'],
  delete_homework: ['owner', 'admin'],
  manage_attendance: ['owner', 'admin', 'teacher'],
  manage_settings: ['owner'],
  manage_teacher: ['owner', 'admin'],
  manage_campus: ['owner', 'admin'],
  manage_members: ['owner', 'admin'],
  manage_member_role: ['owner']
}

// 判断当前角色是否有权执行某操作（未登录一律拒绝）
function can(action) {
  const allowed = permissionMatrix[action]
  return Array.isArray(allowed) && allowed.includes(appContext?.role)
}

// 当前角色可见的板块集合（null = 全部）。teacher 隐藏校区管理、教师管理
function visibleSectionKeys() {
  if (appContext?.role === 'teacher') {
    return new Set(['home', 'students', 'classes', 'homework', 'attendance', 'corrections'])
  }
  return null
}

// 判断某板块当前角色是否可见
function sectionVisible(key) {
  const set = visibleSectionKeys()
  return set ? set.has(key) : true
}

function logSupabaseError(queryName, error) {
  if (!error) return
  console.groupCollapsed(`[Supabase] ${queryName} failed`)
  console.error('query:', queryName)
  console.error('message:', error.message)
  console.error('code:', error.code)
  console.error('details:', error.details)
  console.error('hint:', error.hint)
  console.groupEnd()
}

function logSupabaseResult(queryName, data, error) {
  if (error) logSupabaseError(queryName, error)
  else console.info(`[Supabase] ${queryName} succeeded`, data)
}

function icon(name) {
  const paths = {
    logo: '<path d="M4 5.5 12 2l8 3.5L12 9 4 5.5Z"/><path d="M7 8.4v5.1c0 1.4 2.2 3 5 3s5-1.6 5-3V8.4M4 10v5"/>',
    logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    arrow: '<path d="m9 18 6-6-6-6"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.1 2.4-4.7 5.5-4.7s4.9 1.6 5.5 4.7M15 5.5a3 3 0 0 1 0 5.8M16 14.3c2.4.4 3.8 1.9 4.5 4.7"/>',
    school: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M6 11.2v5.1c0 1.4 2.2 3 6 3s6-1.6 6-3v-5.1M3 13v5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 5.5V21M8 7h8M8 11h7"/>',
    chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`
}

function render() {
  if (!isSupabaseConfigured) return renderConfigError()
  if (!appContext) return renderLogin()
  document.querySelector('#app').innerHTML = shell()
  bindShellEvents()
  loadSection()
}

function renderConfigError() {
  document.querySelector('#app').innerHTML = `<div class="center-screen"><div class="notice-card"><span class="notice-mark">!</span><p class="eyebrow">连接配置</p><h1>还没有连接 Supabase</h1><p>请在 <strong>.env.local</strong> 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY，然后重启开发服务器。</p></div></div>`
}

function renderLogin(error = '') {
  document.querySelector('#app').innerHTML = `<div class="login-page"><div class="login-visual"><div class="brand brand-light"><span class="brand-mark">${icon('logo')}</span><span>鸿慧教育</span></div><div class="visual-copy"><p class="eyebrow">HONGHUI EDUCATION</p><h1>让每一次陪伴，<br/>都有清晰的成长记录。</h1><p>统一管理校区、班级与学生学习进度。</p></div><div class="visual-footer">站前校区 · 高新校区</div></div><div class="login-panel"><div class="login-form-wrap"><p class="eyebrow">管理平台</p><h2>欢迎回来</h2><p class="muted">使用手机号和密码登录。</p>${error ? `<div class="error-banner">${escapeHtml(error)}</div>` : ''}<form data-login-form><label>手机号<input name="phone" type="tel" autocomplete="tel" required placeholder="请输入手机号" /></label><label>密码<input name="password" type="password" autocomplete="current-password" required placeholder="请输入密码" /></label><button class="primary-button wide" type="submit">登录管理后台 ${icon('arrow')}</button></form><p class="login-hint">账号权限由鸿慧教育管理员统一管理</p></div></div></div>`
  document.querySelector('[data-login-form]').addEventListener('submit', login)
}

function renderAccessDenied() {
  document.querySelector('#app').innerHTML = `<div class="center-screen"><div class="notice-card"><span class="notice-mark">×</span><p class="eyebrow">访问受限</p><h1>当前账号没有管理员权限</h1><p>请联系鸿慧教育管理员分配 owner 或 admin 权限。</p><button class="secondary-button" data-logout>退出登录 ${icon('logout')}</button></div></div>`
  document.querySelector('[data-logout]').addEventListener('click', logout)
}

function shell() {
  const profileName = appContext.profile?.real_name || appContext.user.email?.split('@')[0] || '鸿慧管理员'
  return `<div class="admin-shell"><aside class="admin-sidebar"><div class="brand"><span class="brand-mark">${icon('logo')}</span><span>鸿慧教育</span></div><div class="workspace-label">管理平台</div><nav>${navigation.filter(([key]) => sectionVisible(key)).map(([key, symbol]) => `<button class="nav-item ${activeSection === key ? 'active' : ''}" data-section="${key}"><span class="nav-symbol">${symbol}</span><span>${sections[key].label}</span></button>`).join('')}</nav><div class="sidebar-foot"><div class="avatar">${escapeHtml(profileName[0])}</div><div class="sidebar-user"><strong>${escapeHtml(profileName)}</strong><small>${roleLabel[appContext.role]}</small></div><span class="online-dot"></span></div></aside><main class="admin-main"><header class="admin-topbar"><div class="mobile-brand"><span class="brand-mark">${icon('logo')}</span>鸿慧教育</div><div class="org-chip"><span class="status-dot"></span>${escapeHtml(appContext.organization.name)}</div><div class="topbar-user"><span>${escapeHtml(profileName)}</span><button class="icon-button" title="退出登录" data-logout>${icon('logout')}</button></div></header><section class="admin-content"><div class="page-heading"><div><p class="eyebrow">${sections[activeSection].eyebrow}</p><h1>${sections[activeSection].title}</h1><p class="muted">${sections[activeSection].description}</p></div><div class="page-date">${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</div></div><div id="section-content"></div></section></main>${mobileNav()}</div>`
}

// 移动端底部导航（仅手机宽度显示）：主 Tab + 「更多」展开次要板块
function mobileNav() {
  const mainTabs = [
    ['home', '⌂', '首页'],
    ['students', '♙', '学生'],
    ['classes', '▦', '班级'],
    ['homework', '✓', '作业'],
    ['attendance', '◷', '考勤']
  ]
  const moreSections = [
    ['campuses', '⌑', '校区'],
    ['teachers', '♧', '教师'],
    ['corrections', '✎', '批改'],
    ['settings', '⚙', '设置']
  ]
  const visibleMain = mainTabs.filter(([key]) => sectionVisible(key))
  const visibleMore = moreSections.filter(([key]) => sectionVisible(key))
  const moreTabActive = visibleMore.some(([key]) => key === activeSection)
  return `
    ${mobileMoreOpen && visibleMore.length ? `<div class="mobile-more-panel" data-mobile-more-panel>${visibleMore.map(([key, symbol, label]) => `<button class="mobile-more-item ${activeSection === key ? 'active' : ''}" data-section="${key}"><span class="nav-symbol">${symbol}</span><span>${label}</span></button>`).join('')}</div>` : ''}
    <nav class="mobile-tabbar">${visibleMain.map(([key, symbol, label]) => `<button class="mobile-tab ${activeSection === key ? 'active' : ''}" data-section="${key}"><span class="nav-symbol">${symbol}</span><span>${label}</span></button>`).join('')}${visibleMore.length ? `<button class="mobile-tab ${moreTabActive || mobileMoreOpen ? 'active' : ''}" data-mobile-more><span class="nav-symbol">⋯</span><span>更多</span></button>` : ''}</nav>`
}


async function login(event) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const button = event.currentTarget.querySelector('button')
  button.disabled = true
  button.textContent = '登录中...'
  // 手机号登录：先根据 profiles.phone 查 user_id，再取其真实 auth email 登录
  const phone = String(form.get('phone') || '').trim()
  const { data: loginData, error: fnErr } = await supabase.functions.invoke('login-email', { body: { phone } })
  if (fnErr || !loginData?.email) {
    button.disabled = false
    button.textContent = '登录管理后台'
    renderLogin('该手机号未注册，请检查后重试。')
    return
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginData.email, password: form.get('password') })
  logSupabaseResult('auth.signInWithPassword', data, error)
  if (error) {
    renderLogin('手机号或密码错误，请检查后重试。')
    return
  }
  await loadCurrentUser()
}

async function loadCurrentUser() {
  if (!supabase) return
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData?.user
  console.info('[Supabase] auth.getUser user.id:', user?.id || null)
  logSupabaseError('auth.getUser', userError)
  if (userError || !user) {
    appContext = null
    renderLogin(userError?.message || '')
    return
  }
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id, real_name, phone, avatar_url, status').eq('id', user.id).single()
  logSupabaseResult('profiles.currentUser', profile, profileError)
  const { data: membership, error: membershipError } = await supabase.from('organization_members').select('organization_id, role, status').eq('user_id', user.id).eq('status', 'active').single()
  logSupabaseResult('organization_members.currentUser', membership, membershipError)
  if (profileError || membershipError || !profile || !membership) {
    renderAccessDenied()
    return
  }
  const { data: organization, error: organizationError } = await supabase.from('organizations').select('id, name, code, status').eq('id', membership.organization_id).single()
  logSupabaseResult('organizations.currentUser', organization, organizationError)
  if (organizationError || !organization) {
    renderAccessDenied()
    return
  }
  appContext = { user, profile, membership, organization, role: membership.role }
  render()
}

async function logout() {
  await supabase.auth.signOut()
  appContext = null
  activeSection = 'home'
  render()
}

function bindShellEvents() {
  document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { activeSection = button.dataset.section; mobileMoreOpen = false; render() }))
  document.querySelectorAll('[data-mobile-more]').forEach((button) => button.addEventListener('click', () => { mobileMoreOpen = !mobileMoreOpen; render() }))
  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', logout))
}

async function loadSection() {
  const target = document.querySelector('#section-content')
  if (!target) return
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取云端数据...</div>'
  try {
    if (!sectionVisible(activeSection)) {
      activeSection = 'home'
      return render()
    }
    if (activeSection === 'home') {
      if (appContext.role === 'teacher') return renderTeacherHome(await getTeacherOverview())
      return renderHome(await getOverview())
    }
    if (activeSection === 'attendance') {
      if (appContext.role === 'teacher') return renderTeacherAttendancePage()
      return renderAttendancePage()
    }
    if (activeSection === 'students' && appContext.role === 'teacher') return renderTeacherStudents()
    if (activeSection === 'homework' && appContext.role !== 'teacher') return renderHomeworkAdmin()
    if (activeSection === 'campuses' && appContext.role !== 'teacher') return renderCampusAdmin()
    if (activeSection === 'classes' && appContext.role !== 'teacher') return renderClassAdmin()
    if (activeSection === 'settings' && appContext.role !== 'teacher') return renderSettings()
    if (activeSection === 'corrections' && appContext.role === 'teacher') return renderTeacherCorrections()
    const queries = {
      campuses: ['campuses', 'id, name, code, address, contact_phone, status, created_at', 'created_at'],
      classes: ['classes', 'id, name, grade, school_year, status, campus_id, campuses(name)', 'created_at'],
      teachers: ['organization_members', 'id, user_id, role, status, joined_at, profiles(real_name, phone)', 'joined_at'],
      students: ['students', 'id, student_no, real_name, gender, birthday, grade, school_name, status, campus_id, health_note, internal_note, created_at, campuses(name), student_class_enrollments(id, class_id, campus_id, start_date, is_current, classes(id, name, grade, school_year))', 'created_at'],
      homework: ['homework_assignments', 'id, title, subject, content, homework_date, due_date, status, campus_id, class_id, student_id, created_by, created_at, students(real_name, student_no, status, deleted_at), student_homework_records(completion_status), profiles:created_by(real_name)', 'homework_date'],
      corrections: ['correction_records', 'id, correction_status, score, rating, comment, corrected_at, reviewer_id, profiles(real_name), student_homework_records(id, completion_status, homework_assignments(id, title, subject, homework_date, students(real_name, student_no), classes(id, name, campus_id)))', 'corrected_at']
    }
    const [table, columns, order] = queries[activeSection]
    const builder = supabase.from(table).select(columns)
    if (table === 'organization_members' || table === 'students' || table === 'classes' || table === 'homework_assignments') {
      builder.eq('organization_id', appContext.organization.id)
      if (table === 'organization_members') builder.eq('role', 'teacher').eq('status', teacherListFilter)
    }
    if (table === 'students') builder.is('deleted_at', null).neq('status', 'left')
    const { data, error } = await builder.order(order, { ascending: false })
    logSupabaseResult(`dashboard.${activeSection}`, data, error)
    if (error) throw error
    // 作业列表仅显示当前在读学生的作业（离校学生的作业不进当前列表，历史可从批改记录页查看）
    let rows = data || []
    if (activeSection === 'homework') {
      rows = rows.filter((row) => row.students?.status === 'active' && !row.students?.deleted_at)
    }
    renderList(rows)
  } catch (error) {
    target.innerHTML = `<div class="error-state"><strong>暂时无法读取数据</strong><p>${escapeHtml(error.message || '请检查网络连接或账号权限。')}</p><button class="secondary-button" data-retry>重新加载</button></div>`
    target.querySelector('[data-retry]').addEventListener('click', loadSection)
  }
}

async function getOverview() {
  const orgId = appContext.organization.id
  const today = new Date().toISOString().slice(0, 10)
  const baseTables = ['campuses', 'classes', 'students', 'homework_assignments', 'correction_records']
  const baseCounts = await Promise.all(baseTables.map(async (table) => {
    const builder = supabase.from(table).select('*', { count: 'exact', head: true })
    if (table === 'students') builder.is('deleted_at', null).neq('status', 'left')
    const { count, error } = await builder
    if (error) throw error
    return count || 0
  }))
  const base = Object.fromEntries(baseTables.map((t, i) => [t, baseCounts[i]]))

  const [{ data: attendance, error: attErr }, { count: pendingCorrections, error: pcErr }, { count: completedCorrections, error: ccErr }, { count: teacherCount, error: tcErr }, { data: campusStudents, error: csErr }, { data: enrollments, error: enErr }] = await Promise.all([
    supabase.from('student_attendance_records').select('status').eq('organization_id', orgId).eq('attendance_date', today),
    supabase.from('correction_records').select('*', { count: 'exact', head: true }).eq('correction_status', 'pending'),
    supabase.from('correction_records').select('*', { count: 'exact', head: true }).eq('correction_status', 'corrected'),
    supabase.from('organization_members').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('role', 'teacher').eq('status', 'active'),
    supabase.from('students').select('campus_id, campuses(name)').eq('organization_id', orgId).is('deleted_at', null).neq('status', 'left'),
    supabase.from('student_class_enrollments').select('class_id, classes(name)').eq('is_current', true)
  ])
  if (attErr || pcErr || ccErr || tcErr || csErr || enErr) throw (attErr || pcErr || ccErr || tcErr || csErr || enErr)

  const todayAttendance = { present: 0, late: 0, leave: 0, absent: 0 }
  for (const r of (attendance || [])) {
    if (todayAttendance[r.status] != null) todayAttendance[r.status] += 1
  }
  // 考勤合并口径：到校 = present + late；未到 = absent + leave；到校率 = 到校 ÷ 学生总数
  const arrivedCount = (todayAttendance.present || 0) + (todayAttendance.late || 0)
  const notArrivedCount = (todayAttendance.absent || 0) + (todayAttendance.leave || 0)
  const totalStudents = base.students || 0
  const attendanceRate = totalStudents ? Math.round((arrivedCount / totalStudents) * 100) : 0

  const campusCountMap = {}
  for (const s of (campusStudents || [])) {
    const n = s.campuses?.name || '未设置校区'
    campusCountMap[n] = (campusCountMap[n] || 0) + 1
  }
  const campusStudentsList = Object.entries(campusCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  const classCountMap = {}
  for (const e of (enrollments || [])) {
    const n = e.classes?.name || '未设置班级'
    classCountMap[n] = (classCountMap[n] || 0) + 1
  }
  const classStudentsList = Object.entries(classCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  return { ...base, todayAttendance, arrivedCount, notArrivedCount, attendanceRate, pendingCorrections: pendingCorrections || 0, completedCorrections: completedCorrections || 0, teacherCount: teacherCount || 0, campusStudents: campusStudentsList, classStudents: classStudentsList }
}

function renderHome(data) {
  const target = document.querySelector('#section-content')
  const arrivedCount = data.arrivedCount ?? 0
  const notArrivedCount = data.notArrivedCount ?? 0
  const attendanceRate = data.attendanceRate ?? 0
  const campusRows = (data.campusStudents || []).map((c) => `<div class="cockpit-list-row"><span>${escapeHtml(c.name)}</span><strong>${c.count}</strong></div>`).join('') || '<div class="detail-empty">暂无数据</div>'
  const classRows = (data.classStudents || []).map((c) => `<div class="cockpit-list-row"><span>${escapeHtml(c.name)}</span><strong>${c.count}</strong></div>`).join('') || '<div class="detail-empty">暂无数据</div>'
  const todayCards = [
    ['students', '今日学生总数', 'users', '#e7f0ff', '#3973de'],
    [arrivedCount, '今日到校人数', 'check', '#e5f6ee', '#2d916c'],
    [notArrivedCount, '今日未到人数', 'chart', '#fff0f0', '#bd6b6b'],
    [`${attendanceRate}%`, '到校率', 'school', '#e9f5f4', '#398e8b']
  ].map(([value, label, iconName, background, color]) => `<div class="overview-card" style="--card-bg:${background};--card-color:${color}"><span class="overview-icon">${icon(iconName)}</span><span><strong>${value}</strong><small>${label}</small></span></div>`).join('')
  const homeworkStatCards = [
    ['pendingCorrections', '待批改数量', 'check', '#fff0f0', '#bd6b6b'],
    ['completedCorrections', '已完成数量', 'check', '#e5f6ee', '#2d916c']
  ].map(([key, label, iconName, background, color]) => `<div class="overview-card" style="--card-bg:${background};--card-color:${color}"><span class="overview-icon">${icon(iconName)}</span><span><strong>${data[key] ?? 0}</strong><small>${label}</small></span></div>`).join('')
  target.innerHTML = `<div class="welcome-strip"><div><span class="eyebrow">${appContext.role === 'owner' ? 'OWNER WORKSPACE' : 'ADMIN WORKSPACE'}</span><h2>你好，${escapeHtml(appContext.profile.real_name || '鸿慧管理员')}</h2><p>今天也一起，把每一位孩子的成长照顾好。</p></div><div class="welcome-badge">${icon('school')}<span>数据驾驶舱</span></div></div><div class="cockpit-section"><div class="cockpit-title"><p class="eyebrow">TASK CENTER</p><h3>今日任务中心</h3></div><div class="task-center"><div class="task-grid"><div class="task-item"><strong>${arrivedCount}</strong><span>今日到校</span></div><div class="task-item"><strong>${notArrivedCount}</strong><span>今日未到</span></div><div class="task-item"><strong>${attendanceRate}%</strong><span>到校率</span></div><div class="task-item"><strong>${data.pendingCorrections ?? 0}</strong><span>待批改</span></div></div><div class="task-alert-list">${notArrivedCount > 0 ? `<div class="task-alert warn">有 ${notArrivedCount} 名学生今日未签到</div>` : `<div class="task-alert ok">今日考勤全部正常</div>`}${(data.pendingCorrections ?? 0) > 0 ? `<div class="task-alert danger">有 ${data.pendingCorrections} 份作业待批改</div>` : `<div class="task-alert ok">暂无待批改作业</div>`}</div></div></div><div class="cockpit-section"><div class="cockpit-title"><p class="eyebrow">TODAY</p><h3>今日数据</h3></div><div class="overview-grid today-grid">${todayCards}</div></div><div class="cockpit-section"><div class="cockpit-title"><p class="eyebrow">HOMEWORK</p><h3>作业统计</h3></div><div class="overview-grid homework-stats-grid">${homeworkStatCards}</div></div><div class="cockpit-section"><div class="cockpit-title"><p class="eyebrow">OPERATIONS</p><h3>运营数据</h3></div><div class="ops-grid"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">STAFF</p><h3>教师数量</h3></div></div><div class="big-number">${data.teacherCount ?? 0}</div></div><div class="panel"><div class="panel-heading"><div><p class="eyebrow">CAMPUS</p><h3>各校区学生</h3></div></div><div class="cockpit-list">${campusRows}</div></div><div class="panel"><div class="panel-heading"><div><p class="eyebrow">CLASS</p><h3>各班学生</h3></div></div><div class="cockpit-list">${classRows}</div></div></div></div><div class="dashboard-lower"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">权限身份</p><h3>当前账号</h3></div><span class="role-badge">${roleLabel[appContext.role]}</span></div><div class="account-line"><div class="large-avatar">${escapeHtml((appContext.profile.real_name || appContext.user.email || '慧')[0])}</div><div><strong>${escapeHtml(appContext.profile.real_name || '未设置姓名')}</strong><p>${escapeHtml(appContext.user.email || '')}</p></div></div><div class="info-line"><span>所属机构</span><strong>${escapeHtml(appContext.organization.name)}</strong></div><div class="info-line"><span>机构编码</span><strong>${escapeHtml(appContext.organization.code)}</strong></div></div></div>`
  target.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { activeSection = button.dataset.section; render() }))
}

const attendanceStatusLabel = { present: '正常到校', late: '迟到', leave: '请假', absent: '缺勤' }
const todayInputValue = () => new Date().toISOString().slice(0, 10)

// ===== 老师工作台 =====
// 获取老师负责的启用班级
async function getTeacherClasses() {
  if (appContext?.role !== 'teacher') return []
  const { data, error } = await supabase
    .from('class_teachers')
    .select('class_id, classes(id, name, grade, school_year, campus_id, status, organization_id, campuses(id, name))')
    .eq('teacher_id', appContext.user.id)
    .eq('classes.status', 'active')
  logSupabaseResult('teacher.classes', data, error)
  if (error) return []
  return (data || []).map((item) => item.classes).filter((c) => c)
}

// 老师工作台汇总数据（学生数、待批改、班级列表，均受 RLS 限定）
async function getTeacherOverview() {
  const classes = await getTeacherClasses()
  const classIds = classes.map((c) => c.id)
  const today = todayInputValue()
  const [{ count: totalStudents }, { count: pendingCorrections }, { count: completedCorrections }, { count: todayHomeworkCount }, { data: todayAttendance }] = await Promise.all([
    supabase.from('students').select('*', { count: 'exact', head: true }).is('deleted_at', null).neq('status', 'left'),
    classIds.length
      ? supabase.from('correction_records').select('*', { count: 'exact', head: true }).eq('correction_status', 'pending')
      : Promise.resolve({ count: 0 }),
    classIds.length
      ? supabase.from('correction_records').select('*', { count: 'exact', head: true }).eq('correction_status', 'corrected')
      : Promise.resolve({ count: 0 }),
    classIds.length
      ? supabase.from('homework_assignments').select('*', { count: 'exact', head: true }).eq('created_by', appContext.user.id).eq('homework_date', today)
      : Promise.resolve({ count: 0 }),
    classIds.length
      ? supabase.from('student_attendance_records').select('class_id').in('class_id', classIds).eq('attendance_date', today)
      : Promise.resolve({ data: [] })
  ])
  const markedClassIds = new Set((todayAttendance || []).map((r) => r.class_id))
  const markedClassCount = classIds.filter((id) => markedClassIds.has(id)).length
  const unmarkedClassCount = classIds.length - markedClassCount
  return { classes, totalStudents: totalStudents || 0, pendingCorrections: pendingCorrections || 0, completedCorrections: completedCorrections || 0, todayHomeworkCount: todayHomeworkCount || 0, markedClassCount, unmarkedClassCount }
}

// 老师首页工作台
function renderTeacherHome(data) {
  const target = document.querySelector('#section-content')
  const { classes = [], totalStudents = 0, pendingCorrections = 0, completedCorrections = 0, todayHomeworkCount = 0, markedClassCount = 0, unmarkedClassCount = 0 } = data || {}
  const teacherName = appContext.profile?.real_name || '老师'
  target.innerHTML = `
    <div class="welcome-strip teacher-strip">
      <div><span class="eyebrow">TEACHER WORKSPACE</span><h2>你好，${escapeHtml(teacherName)}</h2><p>今天也一起，把孩子们照顾好。</p></div>
      <div class="welcome-badge">${icon('school')}<span>${classes.length} 个班级</span></div>
    </div>
    <div class="teacher-quick-grid">
      <button class="teacher-quick-card quick-primary" data-section="attendance"><span class="overview-icon">◷</span><strong>今日考勤</strong><small>快速点名</small></button>
      <button class="teacher-quick-card quick-green" data-teacher-homework><span class="overview-icon">✓</span><strong>布置作业</strong><small>布置今日作业</small></button>
      <button class="teacher-quick-card quick-blue" data-section="corrections"><span class="overview-icon">✎</span><strong>批改作业</strong><small>待批改 / 已完成</small></button>
      <button class="teacher-quick-card quick-coral" data-section="classes"><span class="overview-icon">▦</span><strong>我的班级</strong><small>我的任教班级</small></button>
    </div>
    <div class="panel task-center">
      <div class="panel-heading"><div><p class="eyebrow">TODAY</p><h3>今日任务</h3></div></div>
      <div class="task-grid">
        <div class="task-item"><strong>${markedClassCount}/${classes.length}</strong><span>已点名班级</span></div>
        <div class="task-item"><strong>${todayHomeworkCount}</strong><span>今日布置作业</span></div>
        <div class="task-item"><strong>${pendingCorrections}</strong><span>待批改作业</span></div>
      </div>
      <div class="task-alert-list">
        ${unmarkedClassCount > 0 ? `<div class="task-alert warn">还有 ${unmarkedClassCount} 个班级未点名</div>` : `<div class="task-alert ok">今日班级已全部点名</div>`}
        ${pendingCorrections > 0 ? `<div class="task-alert danger">还有 ${pendingCorrections} 份作业待批改</div>` : `<div class="task-alert ok">暂无待批改作业</div>`}
      </div>
    </div>
    <div class="teacher-stats">
      <div><strong>${classes.length}</strong><span>我的班级</span></div>
      <div><strong>${totalStudents}</strong><span>在读学生</span></div>
      <button class="teacher-stat-link" data-section="corrections"><strong>${pendingCorrections}</strong><span>待批改</span></button>
      <button class="teacher-stat-link" data-section="corrections"><strong>${completedCorrections}</strong><span>已完成</span></button>
    </div>
    <div class="panel teacher-classes-panel">
      <div class="panel-heading"><div><p class="eyebrow">MY CLASSES</p><h3>我的班级</h3></div></div>
      ${classes.length ? `<div class="teacher-class-list">${classes.map((c) => `<div class="teacher-class-row"><div class="teacher-class-avatar">${escapeHtml((c.name || '班')[0])}</div><div class="teacher-class-info"><strong>${escapeHtml(c.campuses?.name || '')} · ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</strong><small>${escapeHtml(c.school_year || '')}</small></div><button class="secondary-button table-action" data-teacher-class-attendance="${escapeHtml(c.id)}">点名</button></div>`).join('')}</div>` : '<div class="detail-empty">暂无任教班级，请联系管理员分配。</div>'}
    </div>`
  target.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { activeSection = button.dataset.section; mobileMoreOpen = false; render() }))
  target.querySelectorAll('[data-teacher-homework]').forEach((button) => button.addEventListener('click', () => openTeacherHomeworkForm()))
  target.querySelectorAll('[data-teacher-class-attendance]').forEach((button) => button.addEventListener('click', () => openTeacherClassAttendance(button.dataset.teacherClassAttendance)))
}

// ===== 老师批改作业（移动优先 · 学生卡片列表） =====
async function renderTeacherCorrections(filter = 'pending') {
  const target = document.querySelector('#section-content')
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取批改作业...</div>'
  const classes = await getTeacherClasses()
  if (!classes.length) {
    target.innerHTML = '<div class="error-state"><strong>暂无任教班级</strong><p>请联系管理员分配班级。</p></div>'
    return
  }
  const { data, error } = await supabase.from('correction_records')
    .select('id, correction_status, score, rating, student_homework_records(id, completion_status, homework_id, homework_assignments(id, title, subject, homework_date, students(real_name, student_no)))')
    .eq('correction_status', filter)
    .order('created_at', { ascending: false })
  logSupabaseResult('teacher.corrections', data, error)
  if (error) {
    target.innerHTML = `<div class="error-state"><strong>无法读取批改作业</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    return
  }
  const list = (data || []).map((c) => {
    const shr = c.student_homework_records
    const hw = shr?.homework_assignments
    return { id: c.id, correctionStatus: c.correction_status, homeworkId: shr?.homework_id, title: hw?.title, subject: hw?.subject, studentName: hw?.students?.real_name, studentNo: hw?.students?.student_no, completionStatus: shr?.completion_status, score: c.score }
  })
  const filterLabel = { pending: '待批改', corrected: '已完成' }
  const tabHtml = `<div class="filter-tabs">${[['pending', '待批改'], ['corrected', '已完成']].map(([key, label]) => `<button class="filter-tab ${filter === key ? 'active' : ''}" data-corr-filter="${key}">${label}</button>`).join('')}</div>`
  const cards = list.length ? list.map((c) => `<div class="teacher-corr-card"><div class="teacher-student-avatar">${escapeHtml((c.studentName || '学')[0])}</div><div class="teacher-corr-info"><strong>${escapeHtml(c.studentName || '未设置姓名')}</strong><small>${escapeHtml(c.title || '未命名作业')} · ${escapeHtml(c.subject || '综合')}</small><div class="teacher-corr-tags">${completionStatusBadge(c.completionStatus)}${c.score != null ? `<span class="muted small">评分 ${c.score}</span>` : ''}</div></div><div class="teacher-corr-actions">${c.homeworkId ? `<button class="secondary-button table-action" data-view-hw-images="${escapeHtml(c.homeworkId)}">查看图片</button>` : ''}${filter === 'pending' ? `<button class="primary-button table-action" data-mark-corrected="${escapeHtml(c.id)}">标记完成</button>` : statusBadge(c.correctionStatus)}</div></div>`).join('') : `<div class="empty-state"><span class="empty-symbol">${icon('check')}</span><h3>暂无${filterLabel[filter]}作业</h3><p>${filter === 'pending' ? '当前没有需要批改的作业。' : '还没有已批改的作业。'}</p></div>`
  target.innerHTML = `<div class="list-toolbar"><div><strong>${list.length}</strong><span>条${filterLabel[filter]}</span></div></div>${tabHtml}<div class="teacher-corr-list">${cards}</div>`
  target.querySelectorAll('[data-corr-filter]').forEach((btn) => btn.addEventListener('click', () => renderTeacherCorrections(btn.dataset.corrFilter)))
  target.querySelectorAll('[data-mark-corrected]').forEach((btn) => btn.addEventListener('click', () => markCorrectionCorrected(btn.dataset.markCorrected)))
  target.querySelectorAll('[data-view-hw-images]').forEach((btn) => btn.addEventListener('click', (event) => { event.stopPropagation(); openHomeworkImagesViewer(btn.dataset.viewHwImages) }))
}

async function markCorrectionCorrected(correctionId) {
  const { error } = await supabase.from('correction_records').update({ correction_status: 'corrected', corrected_at: new Date().toISOString(), reviewer_id: appContext.user.id }).eq('id', correctionId)
  logSupabaseResult('teacher.correction.markCorrected', null, error)
  if (error) { showToast(error.message || '标记失败，请稍后重试。', 'error'); return }
  showToast('已标记完成')
  await renderTeacherCorrections('pending')
}

async function openHomeworkImagesViewer(homeworkId) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">作业图片</p><h2>学生作业照片</h2></div><button class="icon-button" type="button" title="关闭" data-close-hw-images>×</button></div><div class="loading-state">正在读取图片...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-hw-images]').addEventListener('click', () => modal.remove())
  const { data, error } = await supabase.from('homework_attachments').select('id, storage_path, file_name').eq('homework_id', homeworkId).order('sort_order', { ascending: true })
  logSupabaseResult('teacher.correction.images', data, error)
  const gallery = (data && data.length) ? `<div class="homework-image-grid">${data.map((a) => `<a class="homework-image-item" href="${getHomeworkImageUrl(a.storage_path)}" target="_blank" rel="noopener"><img src="${getHomeworkImageUrl(a.storage_path)}" alt="${escapeHtml(a.file_name)}" loading="lazy" /></a>`).join('')}</div>` : '<div class="detail-empty">暂无作业图片</div>'
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">作业图片</p><h2>学生作业照片</h2></div><button class="icon-button" type="button" title="关闭" data-close-hw-images>×</button></div>${gallery}`
  modal.querySelector('[data-close-hw-images]').addEventListener('click', () => modal.remove())
}

// 老师：直接打开指定班级的今日点名（移动优先卡片式）
async function openTeacherClassAttendance(classId) {
  activeSection = 'attendance'
  await renderTeacherAttendancePage(classId)
}

// ===== 老师查看学生（卡片式，仅自己班级，含今日状态） =====
async function renderTeacherStudents(classFilter = '') {
  const target = document.querySelector('#section-content')
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取学生...</div>'
  const classes = await getTeacherClasses()
  if (!classes.length) {
    target.innerHTML = '<div class="error-state"><strong>暂无任教班级</strong><p>请联系管理员分配班级。</p></div>'
    return
  }
  const currentClass = classFilter || classes[0].id
  const today = todayInputValue()
  const classObj = classes.find((c) => c.id === currentClass) || {}
  const [{ data: enrollments, error: enrollErr }, { data: records, error: recErr }] = await Promise.all([
    supabase.from('student_class_enrollments').select('student_id, students(id, real_name, student_no, grade, campus_id, status, deleted_at)').eq('class_id', currentClass).eq('is_current', true),
    supabase.from('student_attendance_records').select('student_id, status').eq('class_id', currentClass).eq('attendance_date', today)
  ])
  if (enrollErr || recErr) { target.innerHTML = '<div class="error-state"><strong>无法读取学生</strong><p>请稍后重试。</p></div>'; return }
  const statusByStudent = Object.fromEntries((records || []).map((r) => [r.student_id, r.status]))
  const students = (enrollments || []).map((item) => item.students).filter((s) => s?.status === 'active' && !s.deleted_at)
  target.innerHTML = `
    <div class="teacher-attend-toolbar">
      <label>班级<select data-teacher-student-class></select></label>
      <label>今日状态说明<span class="muted small">仅显示已登记</span></label>
    </div>
    <div class="teacher-class-list teacher-student-list">
      ${students.length ? students.map((s) => { const todayStatus = statusByStudent[s.id]; return `<div class="teacher-class-row teacher-student-card"><div class="teacher-student-avatar">${escapeHtml((s.real_name || '学')[0])}</div><div class="teacher-class-info"><strong>${escapeHtml(s.real_name)}</strong><small>${escapeHtml(s.grade || '')}${s.student_no ? ` · 学号 ${escapeHtml(s.student_no)}` : ''}</small></div><span class="attendance-status ${todayStatus || 'empty'}">${todayStatus ? (attendanceStatusLabel[todayStatus] || todayStatus) : '未登记'}</span></div>` }).join('') : '<div class="detail-empty">该班级暂无在读学生</div>'}
    </div>`
  const classSelect = target.querySelector('[data-teacher-student-class]')
  classSelect.innerHTML = classes.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === currentClass ? 'selected' : ''}>${escapeHtml(c.campuses?.name || '')} · ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</option>`).join('')
  classSelect.addEventListener('change', () => renderTeacherStudents(classSelect.value))
}





// ===== 老师今日考勤（移动优先 · 卡片式快速点名） =====
async function renderTeacherAttendancePage(defaultClassId = '') {
  const target = document.querySelector('#section-content')
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取考勤...</div>'
  const classes = await getTeacherClasses()
  teacherClassCache = classes
  if (!classes.length) {
    target.innerHTML = '<div class="error-state"><strong>暂无任教班级</strong><p>请联系管理员分配班级后再点名。</p></div>'
    return
  }
  const selectedClassId = defaultClassId || classes[0].id
  target.innerHTML = `
    <div class="teacher-attend-toolbar">
      <label>班级<select data-teacher-attend-class></select></label>
      <label>日期<input type="date" data-teacher-attend-date /></label>
    </div>
    <div class="teacher-attend-hint" data-teacher-attend-hint>三步完成签到：① 选择班级 ② 点「全体到校」③ 单独修改异常学生，再点底部「保存」。</div>
    <div class="teacher-attend-list" data-teacher-attend-list></div>
    <div class="teacher-attend-save"><button class="primary-button wide" data-teacher-attend-save>保存当天考勤</button></div>`
  const classSelect = target.querySelector('[data-teacher-attend-class]')
  classSelect.innerHTML = classes.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === selectedClassId ? 'selected' : ''}>${escapeHtml(c.campuses?.name || '')} · ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</option>`).join('')
  const dateInput = target.querySelector('[data-teacher-attend-date]')
  dateInput.value = todayInputValue()
  const reload = () => { const cid = classSelect.value; const d = dateInput.value; if (cid) loadTeacherAttendRoster(target, cid, d) }
  classSelect.addEventListener('change', reload)
  dateInput.addEventListener('change', reload)
  target.querySelector('[data-teacher-attend-save]').addEventListener('click', () => saveTeacherAttendance(target))
  await loadTeacherAttendRoster(target, selectedClassId, dateInput.value)
}

async function loadTeacherAttendRoster(target, classId, date) {
  const listEl = target.querySelector('[data-teacher-attend-list]')
  if (!listEl) return
  listEl.innerHTML = '<div class="loading-state">正在读取学生...</div>'
  const className = (() => { const opt = target.querySelector('[data-teacher-attend-class] option:checked') || {}; return opt.textContent || '' })()
  const [{ data: enrollments, error: enrollErr }, { data: records, error: recErr }] = await Promise.all([
    supabase.from('student_class_enrollments').select('student_id, students(id, real_name, student_no, grade, status, deleted_at)').eq('class_id', classId).eq('is_current', true),
    supabase.from('student_attendance_records').select('id, student_id, status').eq('class_id', classId).eq('attendance_date', date)
  ])
  if (enrollErr || recErr) { listEl.innerHTML = '<div class="error-state"><strong>无法读取名单</strong><p>请检查网络后重试。</p></div>'; return }
  const students = (enrollments || []).map((item) => item.students).filter((s) => s?.status === 'active' && !s.deleted_at)
  const recordByStudent = Object.fromEntries((records || []).map((r) => [r.student_id, r]))
  listEl.dataset.classId = classId
  listEl.dataset.date = date
  if (!students.length) { listEl.innerHTML = '<div class="empty-state">该班级暂无在读学生</div>'; return }
  const statusBtn = (status, current) => `<button type="button" class="att-btn ${status} ${current === status ? 'active' : ''}" data-att-set="${status}">${attendanceStatusLabel[status] || status}</button>`
  listEl.innerHTML = `
    <div class="teacher-attend-head"><div><strong>${escapeHtml(className)}</strong><span>${students.length} 名学生</span></div><button class="secondary-button" type="button" data-att-all-present>全体到校</button></div>
    <div class="teacher-attend-cards">${students.map((s) => { const rec = recordByStudent[s.id]; const current = rec?.status || 'present'; return `<div class="teacher-attend-card" data-att-student="${escapeHtml(s.id)}" data-att-status="${current}"><div class="teacher-student-avatar">${escapeHtml((s.real_name || '学')[0])}</div><div class="teacher-student-meta"><strong>${escapeHtml(s.real_name)}</strong><small>${escapeHtml(s.grade || '')}${s.student_no ? ` · ${escapeHtml(s.student_no)}` : ''}</small></div><div class="att-btn-group">${['present', 'late', 'leave', 'absent'].map((st) => statusBtn(st, current)).join('')}</div></div>` }).join('')}</div>`
  listEl.querySelector('[data-att-all-present]')?.addEventListener('click', () => listEl.querySelectorAll('[data-att-student]').forEach((card) => setTeacherAttStatus(card, 'present')))
  listEl.querySelectorAll('[data-att-student]').forEach((card) => card.querySelectorAll('[data-att-set]').forEach((btn) => btn.addEventListener('click', () => setTeacherAttStatus(card, btn.dataset.attSet))))
}


function setTeacherAttStatus(card, status) {
  card.dataset.attStatus = status
  card.querySelectorAll('[data-att-set]').forEach((btn) => btn.classList.toggle('active', btn.dataset.attSet === status))
}

async function saveTeacherAttendance(target) {
  const listEl = target.querySelector('[data-teacher-attend-list]')
  if (!listEl) return
  const classId = listEl.dataset.classId
  const date = listEl.dataset.date
  const classObj = teacherClassCache.find((c) => c.id === classId) || {}
  const cards = listEl.querySelectorAll('[data-att-student]')
  if (!cards.length) return
  const button = target.querySelector('[data-teacher-attend-save]')
  button.disabled = true
  button.textContent = '保存中...'
  const { data: existing } = await supabase.from('student_attendance_records').select('id, student_id').eq('class_id', classId).eq('attendance_date', date)
  const existingById = Object.fromEntries((existing || []).map((r) => [r.student_id, r.id]))
  const operations = Array.from(cards).map((card) => {
    const studentId = card.dataset.attStudent
    const status = card.dataset.attStatus || 'present'
    const payload = { status, recorded_by: appContext.user.id }
    if (existingById[studentId]) return supabase.from('student_attendance_records').update(payload).eq('id', existingById[studentId])
    return supabase.from('student_attendance_records').insert({ id: crypto.randomUUID(), organization_id: appContext.organization.id, campus_id: classObj.campus_id, class_id: classId, student_id: studentId, attendance_date: date, ...payload })
  })
  const results = await Promise.all(operations)
  const error = results.find((r) => r.error)?.error
  button.disabled = false
  button.textContent = '保存当天考勤'
  if (error) { showToast(error.message || '考勤保存失败，请稍后重试。', 'error'); return }
  showToast('当天考勤保存成功')
}


async function renderAttendancePage() {
  const target = document.querySelector('#section-content')
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取考勤基础数据...</div>'
  const { data: campuses, error } = await supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).neq('status', 'archived').order('name')
  logSupabaseResult('attendance.campuses', campuses, error)
  if (error) {
    target.innerHTML = `<div class="error-state"><strong>无法读取校区</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    return
  }
  target.innerHTML = `<div class="attendance-toolbar"><label>日期<input type="date" data-attendance-date value="${todayInputValue()}" /></label><label>校区<select data-attendance-campus><option value="">请选择校区</option>${(campuses || []).map((campus) => `<option value="${escapeHtml(campus.id)}">${escapeHtml(campus.name)}</option>`).join('')}</select></label><label>班级<select data-attendance-class disabled><option value="">请先选择校区</option></select></label><button class="primary-button" data-load-attendance>加载考勤</button></div><div data-attendance-content><div class="empty-state"><h3>请选择日期、校区和班级</h3><p>加载后可以录入当天考勤。</p></div></div>`
  const campusSelect = target.querySelector('[data-attendance-campus]')
  campusSelect.addEventListener('change', () => loadAttendanceClasses(target, campusSelect.value))
  target.querySelector('[data-load-attendance]').addEventListener('click', () => loadAttendanceRoster(target))
}

async function loadAttendanceClasses(target, campusId) {
  const classSelect = target.querySelector('[data-attendance-class]')
  classSelect.disabled = !campusId
  if (!campusId) {
    classSelect.innerHTML = '<option value="">请先选择校区</option>'
    return
  }
  classSelect.innerHTML = '<option value="">正在读取班级...</option>'
  const { data: classes, error } = await supabase.from('classes').select('id, name, grade, school_year, campuses(name)').eq('organization_id', appContext.organization.id).eq('campus_id', campusId).eq('status', 'active').order('name')
  logSupabaseResult('attendance.classes', classes, error)
  if (error) {
    classSelect.innerHTML = '<option value="">无法读取班级</option>'
    classSelect.disabled = true
    return
  }
  classSelect.innerHTML = `<option value="">请选择班级</option>${(classes || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.campuses?.name || '')} · ${escapeHtml(item.name)}${item.grade ? ` · ${escapeHtml(item.grade)}` : ''}</option>`).join('')}`
  classSelect.disabled = false
}

async function loadAttendanceRoster(target) {
  const date = target.querySelector('[data-attendance-date]').value
  const campusId = target.querySelector('[data-attendance-campus]').value
  const classId = target.querySelector('[data-attendance-class]').value
  const content = target.querySelector('[data-attendance-content]')
  if (!date || !campusId || !classId) {
    content.innerHTML = '<div class="error-state"><strong>请先完整选择条件</strong><p>日期、校区和班级都是必填项。</p></div>'
    return
  }
  content.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取学生考勤...</div>'
  const [{ data: enrollments, error: enrollmentError }, { data: records, error: recordError }] = await Promise.all([
    supabase.from('student_class_enrollments').select('student_id, students(id, real_name, student_no, status, deleted_at)').eq('class_id', classId).eq('campus_id', campusId).eq('is_current', true),
    supabase.from('student_attendance_records').select('id, student_id, status, note').eq('class_id', classId).eq('campus_id', campusId).eq('attendance_date', date)
  ])
  logSupabaseResult('attendance.roster.students', enrollments, enrollmentError)
  logSupabaseResult('attendance.roster.records', records, recordError)
  if (enrollmentError || recordError) {
    const error = enrollmentError || recordError
    content.innerHTML = `<div class="error-state"><strong>无法读取考勤</strong><p>${escapeHtml(error.message || '请检查考勤 migration 和 RLS。')}</p></div>`
    return
  }
  const recordByStudent = Object.fromEntries((records || []).map((record) => [record.student_id, record]))
  const students = (enrollments || []).map((item) => item.students).filter((student) => student?.status === 'active' && !student.deleted_at)
  renderAttendanceRoster(target, students, recordByStudent, date, campusId, classId)
}

function renderAttendanceRoster(target, students, recordByStudent, date, campusId, classId) {
  const counts = students.reduce((result, student) => { const status = recordByStudent[student.id]?.status || 'present'; result[status] += 1; return result }, { present: 0, late: 0, leave: 0, absent: 0 })
  const attendanceRate = students.length ? `${(((counts.present + counts.late) / students.length) * 100).toFixed(1)}%` : '0.0%'
  const content = target.querySelector('[data-attendance-content]')
  content.innerHTML = `<div class="attendance-summary"><div><strong>${students.length}</strong><span>今日人数</span></div><div><strong>${counts.present}</strong><span>正常</span></div><div><strong>${counts.late}</strong><span>迟到</span></div><div><strong>${counts.leave}</strong><span>请假</span></div><div><strong>${counts.absent}</strong><span>缺勤</span></div><div><strong>${attendanceRate}</strong><span>出勤率</span></div></div><form data-attendance-form><div class="list-toolbar"><div><strong>${students.length}</strong><span>名在读学生</span></div><button class="secondary-button" type="button" data-mark-all-present>全班正常到校</button></div><div class="attendance-table-wrap"><table class="data-table attendance-table"><thead><tr><th>学生姓名</th><th>学号</th><th>班级</th><th>今日状态</th><th>备注</th></tr></thead><tbody>${students.length ? students.map((student) => { const record = recordByStudent[student.id]; const status = record?.status || 'present'; return `<tr data-attendance-student="${escapeHtml(student.id)}" data-record-id="${escapeHtml(record?.id || '')}"><td>${escapeHtml(student.real_name)}</td><td>${escapeHtml(student.student_no || '—')}</td><td>当前班级</td><td><select data-attendance-status><option value="present" ${status === 'present' ? 'selected' : ''}>正常到校</option><option value="late" ${status === 'late' ? 'selected' : ''}>迟到</option><option value="leave" ${status === 'leave' ? 'selected' : ''}>请假</option><option value="absent" ${status === 'absent' ? 'selected' : ''}>缺勤</option></select></td><td><input data-attendance-note value="${escapeHtml(record?.note || '')}" placeholder="备注" /></td></tr>` }).join('') : '<tr><td colspan="5"><div class="empty-state">当前班级暂无在读学生</div></td></tr>'}</tbody></table></div><div class="modal-actions attendance-actions"><button class="primary-button" type="submit">保存当天考勤</button></div></form>`
  content.querySelector('[data-mark-all-present]')?.addEventListener('click', () => content.querySelectorAll('[data-attendance-status]').forEach((select) => { select.value = 'present' }))
  content.querySelector('[data-attendance-form]')?.addEventListener('submit', (event) => saveAttendance(event, date, campusId, classId))
}

async function saveAttendance(event, date, campusId, classId) {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  const operations = Array.from(form.querySelectorAll('[data-attendance-student]')).map(async (row) => {
    const payload = { status: row.querySelector('[data-attendance-status]').value, note: row.querySelector('[data-attendance-note]').value.trim() || null, recorded_by: appContext.user.id }
    if (row.dataset.recordId) return supabase.from('student_attendance_records').update(payload).eq('id', row.dataset.recordId)
    return supabase.from('student_attendance_records').insert({ id: crypto.randomUUID(), organization_id: appContext.organization.id, campus_id: campusId, class_id: classId, student_id: row.dataset.attendanceStudent, attendance_date: date, ...payload })
  })
  const results = await Promise.all(operations)
  const error = results.find((result) => result.error)?.error
  if (error) {
    logSupabaseError('attendance.save', error)
    showToast(error.message || '考勤保存失败，请稍后重试。', 'error')
  } else {
    showToast('当天考勤保存成功')
    await loadAttendanceRoster(document.querySelector('#section-content'))
  }
  button.disabled = false
}

function renderList(rows) {
  const target = document.querySelector('#section-content')
  const config = {
    campuses: { headers: ['校区名称', '编码', '地址', '联系电话', '状态'], cells: (row) => [row.name, row.code, row.address || '未填写', row.contact_phone || '未填写', statusBadge(row.status)] },
    classes: { headers: ['班级名称', '年级', '所属校区', '学年', '状态', '操作'], cells: (row) => { const canEdit = can('edit_class'); const canDisable = can('disable_class'); const canArchive = can('archive_class'); const canCleanup = can('cleanup_class'); const canDelete = can('delete_class'); return [row.name, row.grade, row.campuses?.name || '—', row.school_year, statusBadge(row.status), `<div class="table-actions">${canEdit ? `<button class="secondary-button table-action" data-edit-class="${escapeHtml(row.id)}">编辑</button>` : ''}${canDisable && row.status !== 'disabled' ? `<button class="secondary-button table-action leave-action" data-disable-class="${escapeHtml(row.id)}">停用</button>` : ''}${canArchive && row.status !== 'archived' ? `<button class="secondary-button table-action" data-archive-class="${escapeHtml(row.id)}">归档</button>` : ''}${canCleanup ? `<button class="secondary-button table-action" data-cleanup-class="${escapeHtml(row.id)}">清理历史学生关系</button>` : ''}${canDelete ? `<button class="secondary-button table-action leave-action" data-delete-class="${escapeHtml(row.id)}">删除</button>` : ''}</div>`] } },
    teachers: { headers: ['教师', '手机号', '状态', '加入时间', '操作'], cells: (row) => { const canManage = can('manage_teacher'); const memStatus = row.status; const action = !canManage ? '' : memStatus === 'archived' ? `<div class="table-actions"><button class="secondary-button table-action" data-restore-teacher="${escapeHtml(row.id)}">恢复</button></div>` : `<div class="table-actions"><button class="secondary-button table-action" data-edit-teacher="${escapeHtml(row.id)}" data-teacher-user="${escapeHtml(row.user_id)}">编辑</button>${memStatus === 'disabled' ? `<button class="secondary-button table-action" data-toggle-teacher="${escapeHtml(row.id)}" data-to="active">启用</button>` : `<button class="secondary-button table-action leave-action" data-toggle-teacher="${escapeHtml(row.id)}" data-to="disabled">停用</button>`}<button class="secondary-button table-action leave-action" data-delete-teacher="${escapeHtml(row.id)}" data-teacher-user="${escapeHtml(row.user_id)}">删除</button><button class="secondary-button table-action" data-reset-teacher-password="${escapeHtml(row.user_id)}">重置密码</button></div>`; return [row.profiles?.real_name || '未设置姓名', row.profiles?.phone || '未填写', statusBadge(row.status), formatDate(row.joined_at), action] } },
    students: { headers: ['学生姓名', '学号', '年级', '所属校区', '当前班级', '就读学校', '状态', '操作'], cells: (row) => { const enrollment = getCurrentEnrollment(row); const canEdit = can('edit_student'); const canLeave = can('leave_student'); return [row.real_name, row.student_no || '—', row.grade, row.campuses?.name || '—', enrollment?.classes?.name || '未分配', row.school_name || '未填写', statusBadge(row.status), `<div class="table-actions">${canEdit ? `<button class="secondary-button table-action" data-edit-student="${escapeHtml(row.id)}">编辑</button>` : ''}${canLeave ? `<button class="secondary-button table-action leave-action" data-leave-student="${escapeHtml(row.id)}">离校</button>` : ''}</div>`] } },
    homework: { headers: ['学生姓名', '学号', '作业名称', '科目', '发布日期', '完成状态', '状态', '操作'], cells: (row) => { const canDelete = can('delete_homework'); return [row.students?.real_name || '—', row.students?.student_no || '—', row.title, row.subject || '综合', formatDate(row.homework_date), completionStatusBadge(row.student_homework_records?.[0]?.completion_status), statusBadge(row.status), `<div class="table-actions"><button class="secondary-button table-action" data-view-homework="${escapeHtml(row.id)}">查看</button>${canDelete ? `<button class="secondary-button table-action leave-action" data-delete-homework="${escapeHtml(row.id)}">删除</button>` : ''}</div>`] } },
    corrections: { headers: ['作业', '学生', '批改状态', '评分', '评价', '批改老师', '批改时间', '操作'], cells: (row) => { const shr = row.student_homework_records; const hw = shr?.homework_assignments; const canCorrect = can('correct_homework'); return [hw?.title || '—', hw?.students?.real_name || '—', statusBadge(row.correction_status), row.score ?? '—', row.rating || '未填写', row.profiles?.real_name || '未设置姓名', formatDate(row.corrected_at), canCorrect ? `<div class="table-actions"><button class="secondary-button table-action" data-edit-correction="${escapeHtml(row.id)}" data-record-id="${escapeHtml(shr?.id || '')}">${row.correction_status === 'pending' ? '去批改' : '编辑'}</button></div>` : ''] } },
  }
  const table = config[activeSection]
  const toolbarAction = (activeSection === 'students' && can('create_student')) ? '<button class="primary-button" data-add-student>新增学生</button><button class="secondary-button" data-batch-import-student>批量导入学生</button><button class="secondary-button" data-grade-promotion>批量升年级</button><button class="secondary-button" data-export-students>导出</button>' : (activeSection === 'students' && appContext.role === 'teacher') ? '<button class="secondary-button" data-export-students>导出我班学生</button>' : (activeSection === 'classes' && can('create_class')) ? '<button class="primary-button" data-add-class>新增班级</button>' : (activeSection === 'homework' && can('create_homework')) ? '<button class="primary-button" data-add-homework>新增作业</button>' : (activeSection === 'teachers' && can('manage_teacher')) ? `${teacherListFilter === 'active' ? '<button class="primary-button" data-add-teacher>新增教师</button>' : ''}<button class="secondary-button" data-toggle-teacher-filter>${teacherListFilter === 'active' ? '查看已归档' : '查看当前'}</button>` : `<span class="read-only-tag">云端数据 · 只读列表</span>`
  const searchBox = activeSection === 'students' ? '<input class="list-search" type="search" data-student-search placeholder="搜索姓名 / 学号" />' : ''
  const PAGE_SIZE = 50
  let filteredRows = rows.slice()
  let currentPage = 1
  let correctionsFilter = 'all'

  const paginate = (list, page) => {
    const total = list.length
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const p = Math.min(Math.max(1, page), totalPages)
    const start = (p - 1) * PAGE_SIZE
    return { pageRows: list.slice(start, start + PAGE_SIZE), totalPages, page: p }
  }
  const renderTable = (list, page) => {
    const { pageRows, totalPages, page: p } = paginate(list, page)
    const tableRows = pageRows.map((row) => `<tr ${activeSection === 'homework' ? `class="clickable-row" data-homework-id="${escapeHtml(row.id)}"` : activeSection === 'students' ? `class="clickable-row" data-student-id="${escapeHtml(row.id)}"` : ''}>${table.cells(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
    const bodyHtml = pageRows.length ? `<table class="data-table"><thead><tr>${table.headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>` : `<div class="empty-state"><span class="empty-symbol">${icon('book')}</span><h3>${list.length ? '没有匹配的记录' : '还没有记录'}</h3><p>${list.length ? '请尝试其他筛选或关键词。' : `当前云端暂无${sections[activeSection].label}数据。`}</p></div>`
    const pageBar = totalPages > 1 ? `<div class="pagination"><button type="button" class="page-btn" data-page="${p - 1}" ${p <= 1 ? 'disabled' : ''}>上一页</button><span class="page-info">第 ${p} / ${totalPages} 页 · ${list.length} 条</span><button type="button" class="page-btn" data-page="${p + 1}" ${p >= totalPages ? 'disabled' : ''}>下一页</button></div>` : ''
    return `<div class="data-table-wrap">${bodyHtml}${pageBar}</div>`
  }
  const applyTable = (list, page) => {
    const { pageRows } = paginate(list, page)
    const wrap = target.querySelector('.data-table-wrap')
    if (wrap) wrap.outerHTML = renderTable(list, page)
    bindRowEvents(pageRows)
    target.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.disabled) return
      applyTable(filteredRows, Number(btn.dataset.page))
    }))
  }
  const bindRowEvents = (visibleRows) => {
    target.querySelectorAll('[data-edit-student]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openStudentForm(visibleRows.find((row) => row.id === button.dataset.editStudent)) }))
    target.querySelectorAll('[data-leave-student]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); markStudentLeft(button.dataset.leaveStudent) }))
    target.querySelectorAll('[data-edit-class]').forEach((button) => button.addEventListener('click', () => openClassForm(visibleRows.find((row) => row.id === button.dataset.editClass))))
    target.querySelectorAll('[data-disable-class]').forEach((button) => button.addEventListener('click', () => disableClass(button.dataset.disableClass)))
    target.querySelectorAll('[data-archive-class]').forEach((button) => button.addEventListener('click', () => archiveClass(button.dataset.archiveClass)))
    target.querySelectorAll('[data-cleanup-class]').forEach((button) => button.addEventListener('click', () => cleanupClassEnrollments(button.dataset.cleanupClass)))
    target.querySelectorAll('[data-delete-class]').forEach((button) => button.addEventListener('click', () => deleteClass(button.dataset.deleteClass)))
    target.querySelectorAll('[data-homework-id]').forEach((row) => row.addEventListener('click', () => openHomeworkDetail(visibleRows.find((item) => item.id === row.dataset.homeworkId))))
    target.querySelectorAll('[data-view-homework]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openHomeworkDetail(visibleRows.find((item) => item.id === button.dataset.viewHomework)) }))
    target.querySelectorAll('[data-delete-homework]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); deleteHomework(button.dataset.deleteHomework) }))
    target.querySelectorAll('[data-edit-correction]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openCorrectionPanel(button.dataset.recordId, button.dataset.editCorrection) }))
    target.querySelectorAll('[data-edit-teacher]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openTeacherEdit(visibleRows.find((row) => row.id === button.dataset.editTeacher)) }))
    target.querySelectorAll('[data-toggle-teacher]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); toggleTeacherStatus(button.dataset.toggleTeacher, button.dataset.to) }))
    target.querySelectorAll('[data-delete-teacher]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); softDeleteTeacher(button.dataset.deleteTeacher) }))
    target.querySelectorAll('[data-reset-teacher-password]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openResetPasswordModal(button.dataset.resetTeacherPassword) }))
  target.querySelectorAll('[data-restore-teacher]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); restoreTeacher(button.dataset.restoreTeacher) }))
    target.querySelectorAll('[data-student-id]').forEach((row) => row.addEventListener('click', () => openStudentDetail(visibleRows.find((item) => item.id === row.dataset.studentId))))
  }
  const correctionFilterBar = activeSection === 'corrections' ? `<div class="filter-tabs">${[['all', '全部'], ['pending', '待批改'], ['corrected', '已批改'], ['needs_revision', '需订正']].map(([key, label]) => `<button type="button" class="filter-tab ${correctionsFilter === key ? 'active' : ''}" data-correction-filter="${key}">${label}</button>`).join('')}</div>` : ''
  target.innerHTML = `<div class="list-toolbar"><div><strong>${rows.length}</strong><span>条记录</span></div>${searchBox}${toolbarAction}</div>${correctionFilterBar}${renderTable(filteredRows, 1)}`
  target.querySelector('[data-add-student]')?.addEventListener('click', () => openStudentForm())
  target.querySelector('[data-batch-import-student]')?.addEventListener('click', () => openBatchImportModal())
  target.querySelector('[data-grade-promotion]')?.addEventListener('click', () => openGradePromotionModal())
  target.querySelector('[data-export-students]')?.addEventListener('click', () => openExportStudentsModal())
  target.querySelector('[data-add-class]')?.addEventListener('click', () => openClassForm())
  target.querySelector('[data-add-homework]')?.addEventListener('click', () => { if (appContext.role === 'teacher') { openTeacherHomeworkForm() } else { openHomeworkForm() } })
  target.querySelector('[data-add-teacher]')?.addEventListener('click', () => openTeacherForm())
  target.querySelector('[data-toggle-teacher-filter]')?.addEventListener('click', () => { teacherListFilter = teacherListFilter === 'active' ? 'archived' : 'active'; loadSection() })
  applyTable(filteredRows, 1)
  target.querySelectorAll('[data-correction-filter]').forEach((btn) => btn.addEventListener('click', () => {
    correctionsFilter = btn.dataset.correctionFilter
    filteredRows = correctionsFilter === 'all' ? rows.slice() : rows.filter((r) => r.correction_status === correctionsFilter)
    target.querySelectorAll('[data-correction-filter]').forEach((b) => b.classList.toggle('active', b.dataset.correctionFilter === correctionsFilter))
    applyTable(filteredRows, 1)
  }))
  const searchInput = target.querySelector('[data-student-search]')
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const keyword = searchInput.value.trim().toLowerCase()
      filteredRows = keyword ? rows.filter((row) => (row.real_name || '').toLowerCase().includes(keyword) || (row.student_no || '').toLowerCase().includes(keyword)) : rows.slice()
      applyTable(filteredRows, 1)
    })
  }
}


async function openStudentDetail(student) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.studentDetail = 'true'
  const enrollment = getCurrentEnrollment(student)
  modal.innerHTML = `<div class="modal detail-modal"><div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${escapeHtml(student.real_name)}</h2><p class="muted">${escapeHtml(student.student_no || '未设置学号')} · ${escapeHtml(enrollment?.classes?.name || '未分配班级')}</p></div><button class="icon-button" type="button" title="关闭" data-close-student-detail>×</button></div><div class="loading-state">正在读取学习记录...</div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-student-detail]').addEventListener('click', () => modal.remove())
  const [homeworkResult, enrollmentResult, attendanceResult] = await Promise.all([
    supabase.from('student_homework_records').select('id, completion_status, completed_at, note, homework_assignments(title, subject, homework_date, classes(name))').eq('student_id', student.id).order('created_at', { ascending: false }),
    supabase.from('student_class_enrollments').select('id, start_date, end_date, is_current, classes(name, grade, school_year)').eq('student_id', student.id).order('start_date', { ascending: false }),
    supabase.from('student_attendance_records').select('attendance_date, status, note').eq('student_id', student.id).gte('attendance_date', new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)).order('attendance_date', { ascending: false })
  ])
  logSupabaseResult('students.detail.homework', homeworkResult.data, homeworkResult.error)
  logSupabaseResult('students.detail.enrollments', enrollmentResult.data, enrollmentResult.error)
  logSupabaseResult('students.detail.attendance', attendanceResult.data, attendanceResult.error)
  if (homeworkResult.error || enrollmentResult.error || attendanceResult.error) {
    const error = homeworkResult.error || enrollmentResult.error || attendanceResult.error
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${escapeHtml(student.real_name)}</h2></div><button class="icon-button" type="button" title="关闭" data-close-student-detail>×</button></div><div class="error-state"><strong>无法读取学生详情</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    modal.querySelector('[data-close-student-detail]').addEventListener('click', () => modal.remove())
    return
  }
  renderStudentDetail(modal, student, homeworkResult.data || [], enrollmentResult.data || [])
  appendAttendanceDetail(modal, attendanceResult.data || [])
}

function renderStudentDetail(modal, student, homeworkRecords, enrollments) {
  const completedCount = homeworkRecords.filter((record) => ['completed', 'late'].includes(record.completion_status)).length
  const completionRate = homeworkRecords.length ? `${Math.round((completedCount / homeworkRecords.length) * 100)}%` : '—'
  const enrollment = getCurrentEnrollment(student)
  const canManage = can('manage_student')
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${escapeHtml(student.real_name)}</h2><p class="muted">${escapeHtml(student.student_no || '未设置学号')} · ${escapeHtml(enrollment?.classes?.name || '未分配班级')}</p></div><button class="icon-button" type="button" title="关闭" data-close-student-detail>×</button></div><section class="detail-section"><div class="detail-section-heading"><p class="eyebrow">基础信息</p><h3>学生资料</h3></div><div class="detail-info-grid"><div><span>姓名</span><strong>${escapeHtml(student.real_name)}</strong></div><div><span>学号</span><strong>${escapeHtml(student.student_no || '—')}</strong></div><div><span>性别</span><strong>${student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : '未设置'}</strong></div><div><span>年级</span><strong>${escapeHtml(student.grade)}</strong></div><div><span>学校</span><strong>${escapeHtml(student.school_name || '未填写')}</strong></div><div><span>校区</span><strong>${escapeHtml(student.campuses?.name || '—')}</strong></div><div><span>当前班级</span><strong>${escapeHtml(enrollment?.classes?.name || '未分配')}</strong></div><div><span>状态</span><strong>${student.status === 'active' ? '在读' : escapeHtml(student.status || '—')}</strong></div></div></section><section class="detail-section"><div class="detail-section-heading"><p class="eyebrow">学习记录</p><h3>作业完成情况</h3></div><div class="detail-stats"><div><strong>${homeworkRecords.length}</strong><span>历史作业</span></div><div><strong>${completedCount}</strong><span>已完成</span></div><div><strong>${completionRate}</strong><span>完成率</span></div></div>${homeworkRecords.length ? `<div class="detail-list">${homeworkRecords.slice(0, 8).map((record) => `<div class="detail-list-row"><div><strong>${escapeHtml(record.homework_assignments?.title || '未命名作业')}</strong><small>${escapeHtml(record.homework_assignments?.classes?.name || '')} · ${formatDate(record.homework_assignments?.homework_date)}</small></div>${statusBadge(record.completion_status)}</div>`).join('')}</div>` : '<div class="detail-empty">暂无作业完成记录</div>'}</section><section class="detail-section"><div class="detail-section-heading"><div><p class="eyebrow">班级变化记录</p><h3>转班历史</h3></div>${canManage ? '<button class="secondary-button table-action" data-change-class>调整班级</button>' : ''}</div>${enrollments.length ? `<div class="detail-list">${enrollments.map((item) => `<div class="detail-list-row"><div><strong>${escapeHtml(item.classes?.name || '未设置班级')}</strong><small>${formatDate(item.start_date)} 至 ${item.end_date ? formatDate(item.end_date) : '至今'}</small></div><span class="status-badge ${item.is_current ? 'active' : 'archived'}"><i></i>${item.is_current ? '当前班级' : '历史班级'}</span></div>`).join('')}</div>` : '<div class="detail-empty">暂无班级变化记录</div>'}</section>`
  modal.querySelector('[data-close-student-detail]').addEventListener('click', () => modal.remove())
  modal.querySelector('[data-change-class]')?.addEventListener('click', () => openChangeClassModal(student, enrollment))
}

function appendAttendanceDetail(modal, attendanceRecords) {
  const counts = attendanceRecords.reduce((result, record) => { result[record.status] += 1; return result }, { present: 0, late: 0, leave: 0, absent: 0 })
  const attendanceRate = attendanceRecords.length ? `${(((counts.present + counts.late) / attendanceRecords.length) * 100).toFixed(1)}%` : '—'
  modal.querySelector('.modal').insertAdjacentHTML('beforeend', `<section class="detail-section"><div class="detail-section-heading"><p class="eyebrow">最近 30 天</p><h3>考勤记录</h3></div><div class="detail-stats attendance-detail-stats"><div><strong>${counts.present + counts.late}</strong><span>出勤次数</span></div><div><strong>${counts.late}</strong><span>迟到次数</span></div><div><strong>${counts.leave}</strong><span>请假次数</span></div><div><strong>${counts.absent}</strong><span>缺勤次数</span></div><div><strong>${attendanceRate}</strong><span>出勤率</span></div></div>${attendanceRecords.length ? `<div class="detail-list">${attendanceRecords.map((record) => `<div class="detail-list-row"><div><strong>${escapeHtml(record.attendance_date)}</strong><small>${escapeHtml(record.note || '')}</small></div><span class="attendance-status ${record.status}"><i></i>${attendanceStatusLabel[record.status] || record.status}</span></div>`).join('')}</div>` : '<div class="detail-empty">最近 30 天暂无考勤记录</div>'}</section>`)
}

async function openClassForm(classRecord = null) {
  const isEditing = Boolean(classRecord)
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.classModal = 'true'
  modal.dataset.classId = classRecord?.id || ''
  modal.innerHTML = `<div class="modal"><div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>${isEditing ? '编辑班级' : '新增班级'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-modal>×</button></div><div class="loading-state">正在读取校区...</div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-class-modal]').addEventListener('click', () => modal.remove())
  const { data: campuses, error } = await supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).neq('status', 'archived').order('name')
  logSupabaseResult('classes.form.campuses', campuses, error)
  if (error) {
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>${isEditing ? '编辑班级' : '新增班级'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-modal>×</button></div><div class="error-state"><strong>无法读取校区</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    modal.querySelector('[data-close-class-modal]').addEventListener('click', () => modal.remove())
    return
  }
  const value = (field) => escapeHtml(classRecord?.[field] || '')
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>${isEditing ? '编辑班级' : '新增班级'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-modal>×</button></div><form data-class-form><div class="form-grid"><label>校区 <span>*</span><select name="campus_id" required><option value="">请选择校区</option>${(campuses || []).map((campus) => `<option value="${escapeHtml(campus.id)}" ${classRecord?.campus_id === campus.id ? 'selected' : ''}>${escapeHtml(campus.name)}</option>`).join('')}</select></label><label>班级名称 <span>*</span><input name="name" required maxlength="100" value="${value('name')}" /></label><label>年级 <span>*</span><input name="grade" required maxlength="50" value="${value('grade')}" /></label><label>学年 <span>*</span><input name="school_year" required maxlength="20" value="${value('school_year')}" /></label><label>状态<select name="status"><option value="active" ${classRecord?.status === 'active' ? 'selected' : ''}>正常</option><option value="disabled" ${classRecord?.status === 'disabled' ? 'selected' : ''}>已停用</option></select></label></div><div class="form-error" data-class-form-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-class-modal>取消</button><button class="primary-button" type="submit">保存班级</button></div></form>`
  modal.querySelectorAll('[data-close-class-modal]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-class-form]').addEventListener('submit', saveClass)
}

async function saveClass(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-class-modal]')
  const classId = modal.dataset.classId
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-class-form-error]')
  button.disabled = true
  button.textContent = '保存中...'
  errorTarget.textContent = ''
  const payload = { name: form.get('name').trim(), grade: form.get('grade').trim(), school_year: form.get('school_year').trim() }
  const query = classId
    ? supabase.from('classes').update({ ...payload, status: form.get('status'), campus_id: form.get('campus_id') }).eq('id', classId).eq('organization_id', appContext.organization.id)
    : supabase.from('classes').insert({ ...payload, campus_id: form.get('campus_id'), organization_id: appContext.organization.id, status: form.get('status') || 'active' })
  const { data, error } = await query
  logSupabaseResult(classId ? 'classes.update' : 'classes.create', data, error)
  if (error) {
    errorTarget.textContent = error.message || '保存失败，请稍后重试。'
    button.disabled = false
    button.textContent = '保存班级'
    return
  }
  modal.remove()
  showToast(classId ? '班级保存成功' : '班级新增成功')
  await loadSection()
}

async function disableClass(classId) {
  if (!window.confirm('确定停用这个班级吗？停用后不会删除历史记录。')) return
  const { data, error } = await supabase.from('classes').update({ status: 'disabled' }).eq('id', classId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('classes.disable', data, error)
  if (error) {
    showToast(error.message || '停用失败，请稍后重试。', 'error')
    return
  }
  showToast('班级已停用')
  await loadSection()
}

async function archiveClass(classId) {
  if (!window.confirm('确定归档这个班级吗？归档后仅保留历史数据，不能再新增学生或业务。')) return
  const { data, error } = await supabase.from('classes').update({ status: 'archived' }).eq('id', classId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('classes.archive', data, error)
  if (error) {
    showToast(error.message || '归档失败，请稍后重试。', 'error')
    return
  }
  showToast('班级已归档')
  await loadSection()
}

async function deleteClass(classId, className = '') {
  if (!classId || !isValidUuid(classId)) { showToast('无法删除：班级标识无效。', 'error'); return }
  if (!window.confirm(`确定删除【${className || '该班级'}】吗？\n删除后将归档，历史数据全部保留，可随时恢复。`)) return
  const { error } = await supabase.from('classes').update({ status: 'archived' }).eq('id', classId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('classes.delete', null, error)
  if (error) { showToast(error.message || '删除失败，请稍后重试。', 'error'); return }
  showToast('已归档，可在「已归档」列表中恢复。')
  await loadSection()
}

async function cleanupClassEnrollments(classId) {
  if (!window.confirm('确定清理该班级的历史学生关系吗？将删除已离校/转班学生的历史绑定记录，不影响作业、考勤和缴费。')) return
  // 只删除 is_current=false 的历史学生关系，不删除作业、考勤和缴费
  const { data, error } = await supabase.from('student_class_enrollments').delete().eq('class_id', classId).eq('is_current', false)
  logSupabaseResult('classes.cleanup.enrollments', data, error)
  if (error) {
    showToast(error.message || '清理历史学生关系失败，请稍后重试。', 'error')
    return
  }
  // 清理后重新检查班级是否可以删除（含作业完成记录、批改记录、缴费记录等间接关联）
  const [{ data: classHomeworks }, { data: enrolledStudents }] = await Promise.all([
    supabase.from('homework_assignments').select('id').eq('class_id', classId),
    supabase.from('student_class_enrollments').select('student_id').eq('class_id', classId)
  ])
  const homeworkIds = (classHomeworks || []).map((item) => item.id)
  const studentIds = (enrolledStudents || []).map((item) => item.student_id)
  const { data: shrRecords } = homeworkIds.length ? await supabase.from('student_homework_records').select('id').in('homework_id', homeworkIds) : { data: [] }
  const shrIds = (shrRecords || []).map((item) => item.id)
  const [enrollmentResult, homeworkResult, shrResult, correctionResult, attendanceResult, feeResult] = await Promise.all([
    supabase.from('student_class_enrollments').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    supabase.from('homework_assignments').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    homeworkIds.length ? supabase.from('student_homework_records').select('id', { count: 'exact', head: true }).in('homework_id', homeworkIds) : Promise.resolve({ count: 0, error: null }),
    shrIds.length ? supabase.from('correction_records').select('id', { count: 'exact', head: true }).in('homework_record_id', shrIds) : Promise.resolve({ count: 0, error: null }),
    supabase.from('student_attendance_records').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    studentIds.length ? supabase.from('student_fee_records').select('id', { count: 'exact', head: true }).in('student_id', studentIds) : Promise.resolve({ count: 0, error: null })
  ])
  logSupabaseResult('classes.cleanup.check.enrollments', enrollmentResult, enrollmentResult.error)
  logSupabaseResult('classes.cleanup.check.homework', homeworkResult, homeworkResult.error)
  logSupabaseResult('classes.cleanup.check.homework_records', shrResult, shrResult.error)
  logSupabaseResult('classes.cleanup.check.corrections', correctionResult, correctionResult.error)
  logSupabaseResult('classes.cleanup.check.attendance', attendanceResult, attendanceResult.error)
  logSupabaseResult('classes.cleanup.check.fee', feeResult, feeResult.error)
  const checkError = enrollmentResult.error || homeworkResult.error || shrResult.error || correctionResult.error || attendanceResult.error || feeResult.error
  if (checkError) {
    showToast(checkError.message || '清理后检查班级记录失败，请稍后重试。', 'error')
    return
  }
  const hasRecords = (enrollmentResult.count || 0) > 0 || (homeworkResult.count || 0) > 0 || (shrResult.count || 0) > 0 || (correctionResult.count || 0) > 0 || (attendanceResult.count || 0) > 0 || (feeResult.count || 0) > 0
  if (hasRecords) {
    showToast('该班级存在历史业务数据，只能停用或归档。', 'error')
    return
  }
  showToast('历史学生关系已清理，该班级现在可以删除')
  await loadSection()
}


// ===== 老师移动端作业发布（仅限自己班级） =====
async function getClassStudents(classId) {
  const { data, error } = await supabase
    .from('student_class_enrollments')
    .select('student_id, students(id, real_name, student_no, grade, campus_id, status, deleted_at)')
    .eq('class_id', classId)
    .eq('is_current', true)
  logSupabaseResult('teacher.classStudents', data, error)
  if (error) return []
  return (data || []).map((item) => item.students).filter((s) => s && s.status === 'active' && !s.deleted_at)
}

async function openTeacherHomeworkForm() {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.teacherHwModal = 'true'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">学习进度</p><h2>发布作业</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-hw>×</button></div><div class="loading-state">正在读取班级...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-teacher-hw]').addEventListener('click', () => modal.remove())
  const classes = await getTeacherClasses()
  if (!classes.length) {
    modal.querySelector('.modal').innerHTML = '<div class="modal-heading"><div><p class="eyebrow">学习进度</p><h2>发布作业</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-hw>×</button></div><div class="error-state"><strong>暂无任教班级</strong><p>请联系管理员分配班级后再发布作业。</p></div>'
    modal.querySelector('[data-close-teacher-hw]').addEventListener('click', () => modal.remove())
    return
  }
  teacherClassCache = classes
  const classOptions = classes.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.campuses?.name || '')} · ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</option>`).join('')
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学习进度</p><h2>发布作业</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-hw>×</button></div><form data-teacher-hw-form><div class="form-grid"><label>班级 <span>*</span><select name="class_id" data-thw-class required>${classOptions}</select></label><label>学生 <span>*</span><select name="student_id" data-thw-student required><option value="">请选择学生</option></select></label><label>科目<input name="subject" maxlength="50" placeholder="例如：数学" /></label><label>作业日期 <span>*</span><input name="homework_date" type="date" required value="${todayInputValue()}" /></label><label>到期日期<input name="due_date" type="date" /></label><label class="full-width">标题 <span>*</span><input name="title" required maxlength="150" /></label><label class="full-width">内容<textarea name="content" rows="4"></textarea></label><div class="full-width homework-upload"><label class="upload-trigger">${icon('upload')} 上传作业图片（可选）<input type="file" accept="image/*" multiple hidden data-thw-images /></label><div class="upload-preview" data-thw-previews></div></div></div><div class="form-error" data-teacher-hw-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-teacher-hw>取消</button><button class="primary-button" type="submit">发布作业</button></div></form>`
  modal.querySelectorAll('[data-close-teacher-hw]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  const classSelect = modal.querySelector('[data-thw-class]')
  const studentSelect = modal.querySelector('[data-thw-student]')
  const loadStudents = async () => {
    if (!classSelect.value) return
    studentSelect.innerHTML = '<option value="">正在读取学生...</option>'
    const students = await getClassStudents(classSelect.value)
    studentSelect.innerHTML = students.length
      ? `<option value="">请选择学生</option>${students.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.real_name)}${s.grade ? ` · ${escapeHtml(s.grade)}` : ''}${s.student_no ? `（${escapeHtml(s.student_no)}）` : ''}</option>`).join('')}`
      : '<option value="">该班暂无学生</option>'
  }
  classSelect.addEventListener('change', loadStudents)
  await loadStudents()
  modal.querySelector('[data-teacher-hw-form]').addEventListener('submit', saveTeacherHomework)
  const thwImageInput = modal.querySelector('[data-thw-images]')
  const thwPreviews = modal.querySelector('[data-thw-previews]')
  if (thwImageInput) thwImageInput.addEventListener('change', () => renderHomeworkImagePreviews(thwImageInput, thwPreviews))
}

async function saveTeacherHomework(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-teacher-hw-modal]')
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-teacher-hw-error]')
  button.disabled = true
  button.textContent = '发布中...'
  errorTarget.textContent = ''
  const classId = form.get('class_id')
  const studentId = form.get('student_id')
  if (!classId || !studentId) {
    errorTarget.textContent = '请选择班级和学生。'
    button.disabled = false
    button.textContent = '发布作业'
    return
  }
  const classObj = teacherClassCache.find((c) => c.id === classId) || {}
  if (!classObj.id || classObj.status !== 'active') {
    errorTarget.textContent = '该班级已停用或归档，不能新增作业'
    button.disabled = false
    button.textContent = '发布作业'
    return
  }
  const homeworkId = crypto.randomUUID()
  const payload = { id: homeworkId, organization_id: appContext.organization.id, campus_id: classObj.campus_id, class_id: classId, student_id: studentId, subject: form.get('subject').trim() || null, title: form.get('title').trim(), content: form.get('content').trim() || null, homework_date: form.get('homework_date'), due_date: form.get('due_date') || null, created_by: appContext.user.id, status: 'active' }
  const { data, error } = await supabase.from('homework_assignments').insert(payload)
  logSupabaseResult('teacher.homework.create', data, error)
  if (error) {
    errorTarget.textContent = error.message || '发布失败，请稍后重试。'
    button.disabled = false
    button.textContent = '发布作业'
    return
  }
  const { error: recordError } = await supabase.from('student_homework_records').insert({ id: crypto.randomUUID(), homework_id: homeworkId, student_id: studentId, completion_status: 'not_started', recorded_by: appContext.user.id })
  logSupabaseResult('teacher.homework.record.create', null, recordError)
  if (recordError) {
    errorTarget.textContent = `作业已保存，但完成记录创建失败：${recordError.message || '请稍后重试。'}`
    button.disabled = false
    button.textContent = '发布作业'
    return
  }
  const imageInput = modal.querySelector('[data-thw-images]')
  const files = Array.from(imageInput?.files || [])
  if (files.length) {
    const uploadError = await uploadHomeworkImages(homeworkId, files)
    if (uploadError) showToast(`作业已发布，但图片上传失败：${uploadError.message || '请稍后重试。'}`, 'error')
  }
  modal.remove()
  showToast('作业发布成功')
  await loadSection()
}



// ===== 新增教师（管理员后台创建账号，走 Edge Function create-teacher）=====
async function openTeacherForm() {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.teacherModal = 'true'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>新增教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-modal>×</button></div><div class="loading-state">正在读取校区与班级...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-teacher-modal]').addEventListener('click', () => modal.remove())
  const [{ data: campuses, error: cErr }, { data: classes, error: kErr }] = await Promise.all([
    supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).neq('status', 'archived').order('name'),
    supabase.from('classes').select('id, name, grade, campus_id').eq('organization_id', appContext.organization.id).eq('status', 'active').order('name')
  ])
  if (cErr || kErr) {
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>新增教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-modal>×</button></div><div class="error-state"><strong>无法读取数据</strong><p>请稍后重试。</p></div>`
    modal.querySelector('[data-close-teacher-modal]').addEventListener('click', () => modal.remove())
    return
  }
  const campusOptions = (campuses || []).map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')
  const classCheckbox = (classList) => classList.map((c) => `<label class="teacher-class-check"><input type="checkbox" name="class_ids" value="${escapeHtml(c.id)}" /> ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</label>`).join('')
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>新增教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-modal>×</button></div><form data-teacher-form><div class="form-grid"><label>姓名 <span>*</span><input name="real_name" required maxlength="50" /></label><label>手机号（登录账号） <span>*</span><input name="phone" type="tel" required maxlength="20" placeholder="例如：13800138000" /></label><label>初始密码 <span>*</span><input name="password" type="password" required minlength="6" autocomplete="new-password" /></label><label>所属校区 <span>*</span><select name="campus_id" required>${campusOptions}</select></label><label class="full-width">分配班级（可多选）</label></div><div class="teacher-class-picker full-width">${classCheckbox(classes || [])}${(classes || []).length ? '' : '<p class="muted">暂无可分配班级</p>'}</div><div class="form-error" data-teacher-form-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-teacher-modal>取消</button><button class="primary-button" type="submit">创建教师</button></div></form>`
  modal.querySelectorAll('[data-close-teacher-modal]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-teacher-form]').addEventListener('submit', saveTeacher)
}

async function saveTeacher(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-teacher-modal]')
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-teacher-form-error]')
  button.disabled = true
  button.textContent = '创建中...'
  errorTarget.textContent = ''
  const payload = {
    real_name: form.get('real_name').trim(),
    phone: form.get('phone').trim(),
    password: form.get('password'),
    campus_id: form.get('campus_id'),
    class_ids: form.getAll('class_ids')
  }
  if (!payload.real_name || !payload.phone || !payload.password) {
    errorTarget.textContent = '姓名、手机号、初始密码为必填。'
    button.disabled = false
    button.textContent = '创建教师'
    return
  }
  const { data, error } = await supabase.functions.invoke('create-teacher', { body: payload })
  logSupabaseResult('teacher.create', data, error)
  if (error) {
    // 非 2xx 时真实错误体在 error.context 中（FunctionsHttpError），解析出 {error,detail}
    let msg = error.message || '创建失败，请稍后重试。'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body?.error) msg = body.detail ? `${body.error}：${body.detail}` : body.error
      }
    } catch (e) { /* 忽略解析失败 */ }
    errorTarget.textContent = msg
    button.disabled = false
    button.textContent = '创建教师'
    return
  }
  if (!data?.ok) {
    errorTarget.textContent = (data?.detail ? `${data.error}：${data.detail}` : data?.error) || '创建失败，请稍后重试。'
    button.disabled = false
    button.textContent = '创建教师'
    return
  }
  modal.remove()
  showToast('教师账号已创建')
  await loadSection()
}

// ===== 教师管理：编辑 / 校区调整 / 班级调整 / 停用 / 软删除 =====
async function openTeacherEdit(member) {
  const userId = member.user_id
  const memberId = member.id
  if (!memberId || !userId || !isValidUuid(memberId) || !isValidUuid(userId)) { showToast('无法编辑：该教师记录缺少有效标识（ID 为空），请先联系管理员修复数据。', 'error'); return }
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.teacherEditModal = 'true'
  modal.dataset.memberId = memberId || ''
  modal.dataset.userId = userId || ''
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>编辑教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-edit>×</button></div><div class="loading-state">正在读取数据...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-teacher-edit]').addEventListener('click', () => modal.remove())
  const [{ data: campuses, error: cErr }, { data: classes, error: kErr }, { data: campusMems }, { data: classTeachers }] = await Promise.all([
    supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).neq('status', 'archived').order('name'),
    supabase.from('classes').select('id, name, grade, campus_id').eq('organization_id', appContext.organization.id).eq('status', 'active').order('name'),
    supabase.from('campus_members').select('campus_id').eq('user_id', userId),
    supabase.from('class_teachers').select('class_id').eq('teacher_id', userId)
  ])
  if (cErr || kErr) {
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>编辑教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-edit>×</button></div><div class="error-state"><strong>无法读取数据</strong><p>请稍后重试。</p></div>`
    modal.querySelector('[data-close-teacher-edit]').addEventListener('click', () => modal.remove())
    return
  }
  const currentCampusId = campusMems?.[0]?.campus_id || ''
  const currentClassIds = new Set((classTeachers || []).map((ct) => ct.class_id))
  const status = member.status || 'active'
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>编辑教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-teacher-edit>×</button></div><form data-teacher-edit-form><div class="form-grid"><label>姓名 <span>*</span><input name="real_name" required maxlength="50" value="${escapeHtml(member.profiles?.real_name || '')}" /></label><label>手机号<input name="phone" maxlength="20" value="${escapeHtml(member.profiles?.phone || '')}" /></label><label>所属校区 <span>*</span><select name="campus_id" data-edit-campus required>${(campuses || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === currentCampusId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label><label>状态<select name="status"><option value="active" ${status === 'active' ? 'selected' : ''}>正常</option><option value="disabled" ${status === 'disabled' ? 'selected' : ''}>停用</option><option value="archived" ${status === 'archived' ? 'selected' : ''}>已删除</option></select></label><label class="full-width">分配班级（可多选，仅显示所选校区）</label></div><div class="teacher-class-picker full-width" data-edit-class-picker></div><div class="form-error" data-teacher-edit-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-teacher-edit>取消</button><button class="primary-button" type="submit">保存</button></div></form>`
  modal.querySelectorAll('[data-close-teacher-edit]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  const campusSelect = modal.querySelector('[data-edit-campus]')
  const picker = modal.querySelector('[data-edit-class-picker]')
  const renderClasses = () => {
    const campusId = campusSelect.value
    const classList = (classes || []).filter((c) => c.campus_id === campusId)
    picker.innerHTML = classList.length
      ? classList.map((c) => `<label class="teacher-class-check"><input type="checkbox" name="class_ids" value="${escapeHtml(c.id)}" ${currentClassIds.has(c.id) ? 'checked' : ''} /> ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</label>`).join('')
      : '<p class="muted">该校区暂无班级</p>'
  }
  renderClasses()
  campusSelect.addEventListener('change', () => { picker.querySelectorAll('input[name="class_ids"]').forEach((i) => { i.checked = false }); renderClasses() })
  modal.querySelector('[data-teacher-edit-form]').addEventListener('submit', saveTeacherEdit)
}





async function saveTeacherEdit(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-teacher-edit-modal]')
  const memberId = modal.dataset.memberId
  const userId = modal.dataset.userId
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-teacher-edit-error]')
  button.disabled = true
  button.textContent = '保存中...'
  errorTarget.textContent = ''
  const realName = form.get('real_name').trim()
  const phone = form.get('phone').trim() || null
  const status = form.get('status')
  const campusId = form.get('campus_id')
  const classIds = form.getAll('class_ids')
  if (!realName || !campusId) { errorTarget.textContent = '姓名与所属校区为必填。'; button.disabled = false; button.textContent = '保存'; return }
  // 1) profiles
  const { error: pErr } = await supabase.from('profiles').update({ real_name: realName, phone }).eq('id', userId)
  if (pErr) { errorTarget.textContent = `更新个人信息失败：${pErr.message}`; button.disabled = false; button.textContent = '保存'; return }
  // 2) organization_members status
  if (memberId) {
    const { error: mErr } = await supabase.from('organization_members').update({ status }).eq('id', memberId)
    if (mErr) { errorTarget.textContent = `更新教师状态失败：${mErr.message}`; button.disabled = false; button.textContent = '保存'; return }
  }
  // 3) campus_members：清旧 + 插新
  const { error: cdErr } = await supabase.from('campus_members').delete().eq('user_id', userId)
  if (cdErr) { errorTarget.textContent = `更新校区失败：${cdErr.message}`; button.disabled = false; button.textContent = '保存'; return }
  const { error: ciErr } = await supabase.from('campus_members').insert({ campus_id: campusId, user_id: userId, campus_role: 'teacher' })
  if (ciErr) { errorTarget.textContent = `更新校区失败：${ciErr.message}`; button.disabled = false; button.textContent = '保存'; return }
  // 4) class_teachers：清旧 + 插新（无班级则只清）
  const { error: kdErr } = await supabase.from('class_teachers').delete().eq('teacher_id', userId)
  if (kdErr) { errorTarget.textContent = `更新任教班级失败：${kdErr.message}`; button.disabled = false; button.textContent = '保存'; return }
  if (classIds.length) {
    const { error: kiErr } = await supabase.from('class_teachers').insert(classIds.map((cl) => ({ class_id: cl, teacher_id: userId, is_primary: false })))
    if (kiErr) { errorTarget.textContent = `更新任教班级失败：${kiErr.message}`; button.disabled = false; button.textContent = '保存'; return }
  }
  modal.remove()
  showToast('教师信息已保存')
  await loadSection()
}



async function toggleTeacherStatus(memberId, to) {
  if (!memberId || !isValidUuid(memberId)) { showToast('无法操作：教师标识无效，请刷新页面后重试。', 'error'); return }
  if (!window.confirm(to === 'active' ? '确定启用该教师吗？' : '确定停用该教师吗？停用后该教师将无法登录。')) return
  const { error } = await supabase.from('organization_members').update({ status: to }).eq('id', memberId)
  if (error) { showToast(error.message || '操作失败，请稍后重试。', 'error'); return }
  showToast(to === 'active' ? '教师已启用' : '教师已停用')
  await loadSection()
}

async function softDeleteTeacher(memberId) {
  if (!memberId || !isValidUuid(memberId)) { showToast('无法删除：教师标识无效，请刷新页面后重试。', 'error'); return }
  if (!window.confirm('确定删除该教师吗？将采用软删除，保留其历史教学数据，且该教师将无法登录。')) return
  const { error } = await supabase.from('organization_members').update({ status: 'archived' }).eq('id', memberId)
  if (error) { showToast(error.message || '删除失败，请稍后重试。', 'error'); return }
  showToast('教师已删除（软删除，历史数据保留）')
  await loadSection()
}

// ===== 重置教师密码（仅 owner/admin，走 Edge Function reset-teacher-password）=====
function openResetPasswordModal(userId) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.resetPwdModal = 'true'
  modal.dataset.userId = userId || ''
  modal.innerHTML = `<div class="modal"><div class="modal-heading"><div><p class="eyebrow">团队成员</p><h2>重置密码</h2></div><button class="icon-button" type="button" title="关闭" data-close-reset-pwd>×</button></div><div class="modal-body"><p class="modal-desc">为该教师设置新的登录密码（至少 6 位）。仅修改 Auth 密码，不影响其账号、档案、班级与历史数据。</p><form data-reset-pwd-form><label>新密码 <span>*</span><input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="请输入不少于 6 位的新密码" /></label><label>确认新密码 <span>*</span><input name="confirm" type="password" required minlength="6" autocomplete="new-password" placeholder="再次输入新密码" /></label><div class="form-error" data-reset-pwd-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-reset-pwd>取消</button><button class="primary-button" type="submit">确认重置</button></div></form></div></div>`
  document.body.append(modal)
  modal.querySelectorAll('[data-close-reset-pwd]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-reset-pwd-form]').addEventListener('submit', resetTeacherPasswordSubmit)
}

async function resetTeacherPasswordSubmit(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-reset-pwd-modal]')
  const userId = modal.dataset.userId
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-reset-pwd-error]')
  if (!userId) { errorTarget.textContent = '无法重置：该教师记录缺少有效用户标识（user_id 为空）。'; return }
  const password = form.get('password')
  if (!password || password.length < 6) { errorTarget.textContent = '新密码至少 6 位。'; return }
  if (password !== form.get('confirm')) { errorTarget.textContent = '两次输入的新密码不一致。'; return }
  button.disabled = true
  button.textContent = '重置中...'
  errorTarget.textContent = ''
  const { data, error } = await supabase.functions.invoke('reset-teacher-password', { body: { user_id: userId, password } })
  let msg = ''
  if (error) {
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const b = await ctx.json()
        if (b?.error) msg = b.detail ? `${b.error}：${b.detail}` : b.error
      }
    } catch (e) { /* ignore */ }
    msg = msg || error.message || '重置失败，请稍后重试。'
  } else if (!data?.ok) {
    msg = (data?.detail ? `${data.error}：${data.detail}` : data?.error) || '重置失败，请稍后重试。'
  }
  if (msg) {
    errorTarget.textContent = msg
    button.disabled = false
    button.textContent = '确认重置'
    return
  }
  modal.remove()
  showToast('教师密码已重置')
}




async function openHomeworkForm() {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.homeworkModal = 'true'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">学习进度</p><h2>新增作业</h2></div><button class="icon-button" type="button" title="关闭" data-close-homework-modal>×</button></div><div class="loading-state">正在读取学生...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-homework-modal]').addEventListener('click', () => modal.remove())
  const { data: students, error } = await supabase.from('students').select('id, real_name, student_no, campus_id, campuses(name), student_class_enrollments(class_id, is_current, classes(id, status))').eq('organization_id', appContext.organization.id).is('deleted_at', null).neq('status', 'left').order('real_name')
  logSupabaseResult('homework.form.students', students, error)
  // 过滤掉当前班级为停用（disabled）/ 归档（archived）的学生，仅允许向 active 班级学生发布作业
  // 未分配班级的学生保留显示，由保存时的班级校验兜底提示
  const activeStudents = (students || []).filter((student) => {
    const enrollment = (student.student_class_enrollments || []).find((item) => item.is_current)
    if (!enrollment) return true
    return enrollment.classes?.status === 'active'
  })
  if (error) {
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学习进度</p><h2>新增作业</h2></div><button class="icon-button" type="button" title="关闭" data-close-homework-modal>×</button></div><div class="error-state"><strong>无法读取学生</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    modal.querySelector('[data-close-homework-modal]').addEventListener('click', () => modal.remove())
    return
  }
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学习进度</p><h2>新增作业</h2></div><button class="icon-button" type="button" title="关闭" data-close-homework-modal>×</button></div><form data-homework-form><div class="form-grid"><label>学生 <span>*</span><select name="student_id" required><option value="">请选择学生</option>${(activeStudents || []).length ? (activeStudents || []).map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.real_name)}${student.student_no ? `（${escapeHtml(student.student_no)}）` : ''} · ${escapeHtml(student.campuses?.name || '未分配校区')}</option>`).join('') : '<option value="" disabled>暂无可布置作业的在读学生（停用/归档班级学生已过滤）</option>'}</select></label><label>科目<input name="subject" maxlength="50" placeholder="例如：数学" /></label><label>作业日期 <span>*</span><input name="homework_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label><label>到期日期<input name="due_date" type="date" /></label><label class="full-width">标题 <span>*</span><input name="title" required maxlength="150" /></label><label class="full-width">内容<textarea name="content" rows="4"></textarea></label></div><div class="form-error" data-homework-form-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-homework-modal>取消</button><button class="primary-button" type="submit">保存作业</button></div></form>`
  modal.querySelectorAll('[data-close-homework-modal]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-homework-form]').addEventListener('submit', saveHomework)
}

async function saveHomework(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-homework-modal]')
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-homework-form-error]')
  button.disabled = true
  button.textContent = '保存中...'
  errorTarget.textContent = ''
  const studentId = form.get('student_id')
  // 从学生当前班级派生 class_id / campus_id（兼容旧结构，class_id 仍为 NOT NULL）
  // 同时取回班级 status，用于校验仅允许向 active 班级发布作业
  const { data: enrollment, error: enrollmentError } = await supabase.from('student_class_enrollments').select('class_id, campus_id, classes(id, status)').eq('student_id', studentId).eq('is_current', true).maybeSingle()
  logSupabaseResult('homework.enrollment', enrollment, enrollmentError)
  if (enrollmentError || !enrollment) {
    errorTarget.textContent = '该学生尚未分配班级，无法发布作业。'
    button.disabled = false
    button.textContent = '保存作业'
    return
  }
  if (enrollment.classes?.status !== 'active') {
    errorTarget.textContent = '该班级已停用或归档，不能新增作业'
    button.disabled = false
    button.textContent = '保存作业'
    return
  }
  const homeworkId = crypto.randomUUID()
  const payload = { id: homeworkId, organization_id: appContext.organization.id, campus_id: enrollment.campus_id, class_id: enrollment.class_id, student_id: studentId, subject: form.get('subject').trim() || null, title: form.get('title').trim(), content: form.get('content').trim() || null, homework_date: form.get('homework_date'), due_date: form.get('due_date') || null, created_by: appContext.user.id, status: 'active' }
  const { data, error } = await supabase.from('homework_assignments').insert(payload)
  logSupabaseResult('homework.create', data, error)
  if (error) {
    errorTarget.textContent = error.message || '保存失败，请稍后重试。'
    button.disabled = false
    button.textContent = '保存作业'
    return
  }
  // 创建该学生的完成记录
  const { error: recordError } = await supabase.from('student_homework_records').insert({ id: crypto.randomUUID(), homework_id: homeworkId, student_id: studentId, completion_status: 'not_started', recorded_by: appContext.user.id })
  logSupabaseResult('homework.record.create', null, recordError)
  if (recordError) {
    errorTarget.textContent = `作业已保存，但完成记录创建失败：${recordError.message || '请稍后重试。'}`
    button.disabled = false
    button.textContent = '保存作业'
    return
  }
  modal.remove()
  showToast('作业新增成功')
  await loadSection()
}

// ===== 作业批改（correction_records 增改）=====
async function openCorrectionPanel(recordId, correctionId) {
  const isEdit = Boolean(correctionId)
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.correctionModal = 'true'
  modal.dataset.recordId = recordId || ''
  modal.dataset.correctionId = correctionId || ''
  modal.innerHTML = `<div class="modal"><div class="modal-heading"><div><p class="eyebrow">教学反馈</p><h2>${isEdit ? '编辑批改' : '批改作业'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-correction>×</button></div><div class="loading-state">正在加载...</div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-correction]').addEventListener('click', () => modal.remove())
  let correction = null
  if (isEdit) {
    const { data, error } = await supabase.from('correction_records').select('id, correction_status, score, rating, comment').eq('id', correctionId).maybeSingle()
    logSupabaseResult('correction.load', data, error)
    if (error) {
      modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学反馈</p><h2>编辑批改</h2></div><button class="icon-button" type="button" title="关闭" data-close-correction>×</button></div><div class="error-state"><strong>无法读取批改</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
      modal.querySelector('[data-close-correction]').addEventListener('click', () => modal.remove())
      return
    }
    correction = data
  }
  const status = correction?.correction_status || 'pending'
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学反馈</p><h2>${isEdit ? '编辑批改' : '批改作业'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-correction>×</button></div><form data-correction-form><div class="form-grid"><label>批改状态<select name="correction_status"><option value="pending" ${status === 'pending' ? 'selected' : ''}>待批改</option><option value="corrected" ${status === 'corrected' ? 'selected' : ''}>已批改</option><option value="needs_revision" ${status === 'needs_revision' ? 'selected' : ''}>需订正</option></select></label><label>评分(0-100)<input name="score" type="number" min="0" max="100" step="0.5" value="${correction?.score ?? ''}" /></label><label class="full-width">评价<textarea name="rating" rows="2" placeholder="例如：优秀 / 还需加强">${escapeHtml(correction?.rating || '')}</textarea></label><label class="full-width">批改备注<textarea name="comment" rows="4" placeholder="填写具体订正意见">${escapeHtml(correction?.comment || '')}</textarea></label></div><div class="form-error" data-correction-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-correction>取消</button><button class="primary-button" type="submit">保存批改</button></div></form>`
  modal.querySelectorAll('[data-close-correction]').forEach((b) => b.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-correction-form]').addEventListener('submit', saveCorrection)
}

async function saveCorrection(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-correction-modal]')
  const recordId = modal.dataset.recordId
  const correctionId = modal.dataset.correctionId
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-correction-error]')
  button.disabled = true
  button.textContent = '保存中...'
  errorTarget.textContent = ''
  const payload = {
    correction_status: form.get('correction_status'),
    score: form.get('score') ? Number(form.get('score')) : null,
    rating: form.get('rating').trim() || null,
    comment: form.get('comment').trim() || null,
    corrected_at: new Date().toISOString(),
    reviewer_id: appContext.user.id
  }
  let error
  if (correctionId) {
    ({ error } = await supabase.from('correction_records').update(payload).eq('id', correctionId))
    logSupabaseResult('correction.update', null, error)
  } else {
    ({ error } = await supabase.from('correction_records').insert({ id: crypto.randomUUID(), homework_record_id: recordId, ...payload }))
    logSupabaseResult('correction.create', null, error)
  }
  if (error) {
    errorTarget.textContent = error.message || '保存失败，请稍后重试。'
    button.disabled = false
    button.textContent = '保存批改'
    return
  }
  modal.remove()
  showToast('批改已保存')
  await loadSection()
}

async function openHomeworkDetail(homework) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.homeworkDetail = 'true'
  modal.homework = homework
  modal.innerHTML = `<div class="modal"><div class="modal-heading"><div><p class="eyebrow">作业详情</p><h2>${escapeHtml(homework.title)}</h2><p class="muted">${escapeHtml(homework.students?.real_name || '未设置学生')} · ${escapeHtml(homework.subject || '综合')} · ${formatDate(homework.homework_date)}</p></div><button class="icon-button" type="button" title="关闭" data-close-homework-detail>×</button></div><div class="loading-state">正在读取完成情况...</div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-homework-detail]').addEventListener('click', () => modal.remove())
  const { data: records, error: recordError } = await supabase.from('student_homework_records').select('id, student_id, completion_status, completed_at, note').eq('homework_id', homework.id).eq('student_id', homework.student_id).order('created_at', { ascending: false })
  logSupabaseResult('homework.detail.records', records, recordError)
  if (recordError) return renderHomeworkDetailError(modal, recordError)
  let correction = null
  const firstRecordId = records?.[0]?.id
  if (firstRecordId) {
    const { data: corrData, error: corrErr } = await supabase.from('correction_records').select('id, correction_status, score, rating, comment, corrected_at, reviewer_id, profiles(real_name)').eq('homework_record_id', firstRecordId).order('created_at', { ascending: false }).maybeSingle()
    logSupabaseResult('homework.detail.correction', corrData, corrErr)
    if (!corrErr && corrData) correction = corrData
  }
  renderHomeworkDetail(modal, homework, records || [], correction, firstRecordId || '')
}

function renderHomeworkDetailError(modal, error) {
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">作业详情</p><h2>无法读取完成情况</h2></div><button class="icon-button" type="button" title="关闭" data-close-homework-detail>×</button></div><div class="error-state"><strong>操作失败</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
  modal.querySelector('[data-close-homework-detail]').addEventListener('click', () => modal.remove())
}

function renderHomeworkDetail(modal, homework, records, correction = null, recordId = '') {
  const currentRecord = records[0] || null
  const canCorrect = can('correct_homework')
  const isLeft = homework?.students?.status === 'left' || Boolean(homework?.students?.deleted_at)
  const readOnlyNote = isLeft ? '<div class="left-banner">该学生已离校，此记录仅用于历史查看，不能修改完成状态。</div>' : ''
  const corrHtml = recordId && !isLeft
    ? `<section class="detail-section"><div class="detail-section-heading"><div><p class="eyebrow">教学反馈</p><h3>作业批改</h3></div>${canCorrect ? `<button class="secondary-button table-action" data-edit-correction="${escapeHtml(correction?.id || '')}" data-record-id="${escapeHtml(recordId)}">${correction ? '编辑批改' : '去批改'}</button>` : ''}</div>${correction ? `<div class="homework-corr"><div class="detail-stats corr-stats"><div><strong>${correction.score ?? '—'}</strong><span>评分</span></div><div><strong>${statusBadge(correction.correction_status)}</strong><span>状态</span></div><div><strong>${correction.profiles?.real_name || '—'}</strong><span>批改老师</span></div><div><strong>${correction.corrected_at ? formatDate(correction.corrected_at) : '—'}</strong><span>批改时间</span></div></div>${correction.rating ? `<div class="corr-row"><span>评价</span><p>${escapeHtml(correction.rating)}</p></div>` : ''}${correction.comment ? `<div class="corr-row"><span>批改备注</span><p>${escapeHtml(correction.comment)}</p></div>` : ''}</div>` : '<div class="detail-empty">该作业尚未批改。</div>'}</section>`
    : (recordId ? `<section class="detail-section"><div class="detail-section-heading"><div><p class="eyebrow">教学反馈</p><h3>作业批改</h3></div></div>${correction ? `<div class="homework-corr"><div class="detail-stats corr-stats"><div><strong>${correction.score ?? '—'}</strong><span>评分</span></div><div><strong>${statusBadge(correction.correction_status)}</strong><span>状态</span></div><div><strong>${correction.profiles?.real_name || '—'}</strong><span>批改老师</span></div><div><strong>${correction.corrected_at ? formatDate(correction.corrected_at) : '—'}</strong><span>批改时间</span></div></div>${correction.rating ? `<div class="corr-row"><span>评价</span><p>${escapeHtml(correction.rating)}</p></div>` : ''}${correction.comment ? `<div class="corr-row"><span>批改备注</span><p>${escapeHtml(correction.comment)}</p></div>` : ''}</div>` : '<div class="detail-empty">该作业尚未批改。</div>'}</section>` : '')
  const recordHtml = records.length ? records.map((record) => {
    const opts = ['not_started', 'partial', 'completed', 'late'].map((s) => `<option value="${s}" ${record.completion_status === s ? 'selected' : ''}>${completionStatusLabel[s]}</option>`).join('')
    return `<div class="homework-record-row" data-record-id="${escapeHtml(record.id)}"><div><strong>${escapeHtml(homework.students?.real_name || '未设置姓名')}</strong><small>${escapeHtml(homework.students?.student_no || '')}</small></div>${isLeft ? `<span class="completion-status-readonly">${completionStatusLabel[record.completion_status] || record.completion_status}</span>` : `<select data-completion-status>${opts}</select>`}<span class="completion-time">${record.completed_at ? formatDate(record.completed_at) : '—'}</span>${isLeft ? '<span class="muted small">历史记录</span>' : `<input data-record-note placeholder="备注" value="${escapeHtml(record.note || '')}" /><button class="secondary-button table-action" data-save-record>保存</button>`}</div>`
  }).join('') : '<div class="empty-state"><h3>暂无完成记录</h3></div>'
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">作业详情</p><h2>${escapeHtml(homework.title)}</h2><p class="muted">${escapeHtml(homework.students?.real_name || '未设置学生')} · ${escapeHtml(homework.subject || '综合')} · ${formatDate(homework.homework_date)}</p></div><button class="icon-button" type="button" title="关闭" data-close-homework-detail>×</button></div>${readOnlyNote}<div class="homework-stats"><div><strong>${records.length}</strong><span>完成记录</span></div><div><strong>${currentRecord ? completionStatusLabel[currentRecord.completion_status] || currentRecord.completion_status : '—'}</strong><span>当前状态</span></div></div><div class="homework-record-list">${recordHtml}</div>${corrHtml}`
  modal.querySelector('[data-close-homework-detail]').addEventListener('click', () => modal.remove())
  modal.querySelectorAll('[data-save-record]').forEach((button) => button.addEventListener('click', () => saveHomeworkRecord(button.closest('[data-record-id]'))))
  modal.querySelectorAll('[data-edit-correction]').forEach((button) => button.addEventListener('click', () => openCorrectionPanel(button.dataset.recordId, button.dataset.editCorrection)))
  appendHomeworkImages(modal, homework.id)
}

async function appendHomeworkImages(modal, homeworkId) {
  const container = modal.querySelector('.modal')
  const { data, error } = await supabase.from('homework_attachments').select('id, storage_path, file_name, created_at').eq('homework_id', homeworkId).order('sort_order', { ascending: true })
  logSupabaseResult('homework.detail.attachments', data, error)
  const canUpload = can('create_homework')
  const gallery = (data && data.length) ? `<div class="homework-image-grid">${data.map((attachment) => `<a class="homework-image-item" href="${getHomeworkImageUrl(attachment.storage_path)}" target="_blank" rel="noopener"><img src="${getHomeworkImageUrl(attachment.storage_path)}" alt="${escapeHtml(attachment.file_name)}" loading="lazy" /></a>`).join('')}</div>` : '<div class="detail-empty">暂无作业图片</div>'
  const section = document.createElement('section')
  section.className = 'homework-images'
  section.innerHTML = `<div class="detail-section-heading"><div><p class="eyebrow">作业图片</p><h3>学生作业照片</h3></div>${canUpload ? `<label class="upload-trigger">${icon('upload')} 上传图片<input type="file" accept="image/*" multiple hidden data-homework-image-input /></label>` : ''}</div>${gallery}<div class="upload-preview" data-upload-previews></div>${canUpload ? `<div class="modal-actions homework-upload-actions" hidden data-upload-actions><button class="secondary-button" type="button" data-cancel-upload>取消</button><button class="primary-button" type="button" data-save-images>保存图片</button></div>` : ''}`
  container.append(section)
  const input = section.querySelector('[data-homework-image-input]')
  const previews = section.querySelector('[data-upload-previews]')
  const actions = section.querySelector('[data-upload-actions]')
  if (!input) return
  input.addEventListener('change', () => { renderHomeworkImagePreviews(input, previews); actions.hidden = input.files.length === 0 })
  section.querySelector('[data-cancel-upload]')?.addEventListener('click', () => { input.value = ''; renderHomeworkImagePreviews(input, previews); actions.hidden = true })
  section.querySelector('[data-save-images]')?.addEventListener('click', async (event) => {
    const files = Array.from(input.files || [])
    if (!files.length) return
    const button = event.currentTarget
    button.disabled = true
    button.textContent = '上传中...'
    const uploadError = await uploadHomeworkImages(homeworkId, files)
    if (uploadError) { button.disabled = false; button.textContent = '保存图片'; showToast(uploadError.message || '上传失败，请稍后重试。', 'error'); return }
    showToast('作业图片已上传', 'success')
    section.remove()
    appendHomeworkImages(modal, homeworkId)
  })
}

async function saveHomeworkRecord(row) {
  const status = row.querySelector('[data-completion-status]').value
  const note = row.querySelector('[data-record-note]').value.trim() || null
  const completedAt = status === 'not_started' ? null : new Date().toISOString()
  const button = row.querySelector('[data-save-record]')
  button.disabled = true
  const { data, error } = await supabase.from('student_homework_records').update({ completion_status: status, completed_at: completedAt, note, recorded_by: appContext.user.id }).eq('id', row.dataset.recordId)
  logSupabaseResult('homework.detail.record.update', data, error)
  button.disabled = false
  showToast(error ? (error.message || '保存失败，请稍后重试。') : '完成情况已保存', error ? 'error' : 'success')
}

async function deleteHomework(homeworkId) {
  if (!window.confirm('确定删除该学生的这条作业吗？')) return
  // 删除前统计完成记录数量
  const { count: beforeCount, error: countError } = await supabase.from('student_homework_records').select('id', { count: 'exact', head: true }).eq('homework_id', homeworkId)
  console.log('[deleteHomework] 删除前 student_homework_records 数量:', beforeCount, 'countError:', countError?.message || null)
  // student_homework_records 外键为 on delete restrict，必须先删除完成记录，否则删除作业会失败
  const { error: recordError } = await supabase.from('student_homework_records').delete().eq('homework_id', homeworkId)
  logSupabaseResult('homework.delete.records', null, recordError)
  if (recordError) {
    console.log('[deleteHomework] 删除完成记录失败，中止删除作业。error:', recordError.message)
    showToast(recordError.message || '删除完成记录失败，请稍后重试。', 'error')
    return
  }
  // 删除后再次统计，确认完成记录已全部删除
  const { count: afterCount, error: afterCountError } = await supabase.from('student_homework_records').select('id', { count: 'exact', head: true }).eq('homework_id', homeworkId)
  console.log('[deleteHomework] 删除后 student_homework_records 数量:', afterCount, 'afterCountError:', afterCountError?.message || null)
  if (afterCountError) {
    console.log('[deleteHomework] 删除后统计失败，中止删除作业。error:', afterCountError.message)
    showToast(afterCountError.message || '删除完成记录后校验失败，请稍后重试。', 'error')
    return
  }
  if (afterCount > 0) {
    console.log('[deleteHomework] 完成记录未完全删除，剩余:', afterCount, '，中止删除作业。')
    showToast('仍有完成记录未删除，已中止删除作业。', 'error')
    return
  }
  // homework_attachments 外键为 on delete cascade，删除作业时会自动清理附件
  const { data, error } = await supabase.from('homework_assignments').delete().eq('id', homeworkId)
  logSupabaseResult('homework.delete', data, error)
  if (error) {
    console.log('[deleteHomework] 删除作业失败。error:', error.message)
    showToast(error.message || '删除失败，请稍后重试。', 'error')
    return
  }
  console.log('[deleteHomework] 作业删除成功，homeworkId:', homeworkId)
  showToast('作业删除成功')
  await loadSection()
}

// ===== 作业管理：管理员三级下钻（年级 → 班级 → 学生 → 作业详情） =====
function groupHomeworkByHierarchy(rows) {
  const grades = new Map()
  for (const row of rows) {
    const grade = row.classes?.grade || '未分年级'
    const classId = row.class_id || '__none__'
    const className = row.classes?.name || '未分配班级'
    const studentId = row.student_id || '__none__'
    if (!grades.has(grade)) grades.set(grade, new Map())
    const classMap = grades.get(grade)
    if (!classMap.has(classId)) classMap.set(classId, { id: classId, name: className, students: new Map() })
    const classNode = classMap.get(classId)
    if (!classNode.students.has(studentId)) classNode.students.set(studentId, { id: studentId, name: row.students?.real_name || '未设置姓名', no: row.students?.student_no || '', homeworks: [] })
    classNode.students.get(studentId).homeworks.push(row)
  }
  return grades
}

function gradeSortKey(name) {
  const match = String(name).match(/\d+/)
  return match ? Number(match[0]) : String(name)
}

async function renderHomeworkAdmin() {
  const target = document.querySelector('#section-content')
  const { data, error } = await supabase.from('homework_assignments')
    .select('id, title, subject, content, homework_date, due_date, status, class_id, student_id, students(real_name, student_no, status, deleted_at), classes(id, name, grade), student_homework_records(completion_status)')
    .eq('organization_id', appContext.organization.id)
    .order('homework_date', { ascending: false })
  logSupabaseResult('homework.admin.list', data, error)
  if (error) {
    target.innerHTML = `<div class="error-state"><strong>无法读取作业数据</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    return
  }
  const rows = (data || []).filter((row) => row.students?.status === 'active' && !row.students?.deleted_at)
  const grades = groupHomeworkByHierarchy(rows)
  const canDelete = can('delete_homework')
  const canCreate = can('create_homework')
  const state = { level: 'grade', grade: null, classId: null, studentId: null }

  const findClass = (gradeName, classId) => (grades.get(gradeName) || new Map()).get(classId) || null
  const countHomework = (list) => list.reduce((sum, hw) => sum + hw.homeworks.length, 0)

  const breadcrumb = () => {
    const parts = [state.level === 'grade' ? '<strong>全部年级</strong>' : '<button class="crumb-link" data-crumb-grade>全部年级</button>']
    if (state.grade) {
      parts.push(state.level === 'class' ? `<strong>${escapeHtml(state.grade)}</strong>` : `<button class="crumb-link" data-crumb-grade="${escapeHtml(state.grade)}">${escapeHtml(state.grade)}</button>`)
    }
    if (state.classId) {
      const classNode = findClass(state.grade, state.classId)
      if (classNode) parts.push(state.level === 'student' ? `<strong>${escapeHtml(classNode.name)}</strong>` : `<button class="crumb-link" data-crumb-class="${escapeHtml(classNode.id)}">${escapeHtml(classNode.name)}</button>`)
    }
    if (state.studentId) {
      const classNode = findClass(state.grade, state.classId)
      const studentNode = classNode ? classNode.students.get(state.studentId) : null
      if (studentNode) parts.push(`<strong>${escapeHtml(studentNode.name)}</strong>`)
    }
    return `<div class="cockpit-breadcrumb">${parts.join('<span class="crumb-sep">/</span>')}</div>`
  }


  const draw = () => {
    let body = ''
    if (!rows.length) {
      body = `<div class="empty-state"><span class="empty-symbol">${icon('book')}</span><h3>暂无作业</h3><p>当前云端还没有在读学生的作业数据。</p></div>`
    } else if (state.level === 'grade') {
      const gradeList = Array.from(grades.entries()).sort((a, b) => (gradeSortKey(a[0]) - gradeSortKey(b[0])) || String(a[0]).localeCompare(String(b[0]), 'zh-Hans-CN'))
      body = `<div class="drill-grid">${gradeList.map(([gradeName, classMap]) => {
        const classNodes = Array.from(classMap.values())
        const studentCount = classNodes.reduce((sum, c) => sum + c.students.size, 0)
        const homeworkCount = classNodes.reduce((sum, c) => sum + countHomework(Array.from(c.students.values())), 0)
        return `<button class="drill-card" data-open-grade="${escapeHtml(gradeName)}"><div class="drill-card-icon">${icon('school')}</div><div class="drill-card-body"><strong>${escapeHtml(gradeName)}</strong><small>${classNodes.length} 个班级 · ${studentCount} 名学生 · ${homeworkCount} 条作业</small></div>${icon('arrow')}</button>`
      }).join('')}</div>`
    } else if (state.level === 'class') {
      const classMap = grades.get(state.grade) || new Map()
      const classNodes = Array.from(classMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'))
      body = `<div class="drill-list">${classNodes.map((classNode) => {
        const homeworkCount = countHomework(Array.from(classNode.students.values()))
        return `<button class="drill-row" data-open-class="${escapeHtml(classNode.id)}"><div class="drill-row-main"><strong>${escapeHtml(classNode.name)}</strong><small>${classNode.students.size} 名学生 · ${homeworkCount} 条作业</small></div>${icon('arrow')}</button>`
      }).join('')}</div>`
    } else if (state.level === 'student') {
      const classNode = findClass(state.grade, state.classId)
      const students = classNode ? Array.from(classNode.students.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')) : []
      body = `<div class="drill-list">${students.map((student) => `<button class="drill-row" data-open-student="${escapeHtml(student.id)}"><div class="drill-row-main"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.no || '未设置学号')} · ${student.homeworks.length} 条作业</small></div>${icon('arrow')}</button>`).join('')}</div>`
    } else if (state.level === 'homework') {
      const classNode = findClass(state.grade, state.classId)
      const student = classNode ? classNode.students.get(state.studentId) : null
      const list = student ? student.homeworks.slice() : []
      body = list.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>作业名称</th><th>科目</th><th>发布日期</th><th>完成状态</th><th>操作</th></tr></thead><tbody>${list.map((hw) => `<tr><td>${escapeHtml(hw.title)}</td><td>${escapeHtml(hw.subject || '综合')}</td><td>${formatDate(hw.homework_date)}</td><td>${completionStatusBadge(hw.student_homework_records?.[0]?.completion_status)}</td><td><div class="table-actions"><button class="secondary-button table-action" data-view-homework="${escapeHtml(hw.id)}">查看</button>${canDelete ? `<button class="secondary-button table-action leave-action" data-delete-homework="${escapeHtml(hw.id)}">删除</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : '<div class="detail-empty">该学生暂无作业记录。</div>'
    }

    target.innerHTML = `<div class="list-toolbar"><div><strong>${rows.length}</strong><span>条作业</span></div>${canCreate ? '<button class="primary-button" data-add-homework>新增作业</button>' : ''}</div>${breadcrumb()}${body}`
    target.querySelector('[data-add-homework]')?.addEventListener('click', () => openHomeworkForm())
    target.querySelectorAll('[data-open-grade]').forEach((btn) => btn.addEventListener('click', () => { state.level = 'class'; state.grade = btn.dataset.openGrade; state.classId = null; state.studentId = null; draw() }))
    target.querySelectorAll('[data-open-class]').forEach((btn) => btn.addEventListener('click', () => { state.level = 'student'; state.classId = btn.dataset.openClass; state.studentId = null; draw() }))
    target.querySelectorAll('[data-open-student]').forEach((btn) => btn.addEventListener('click', () => { state.level = 'homework'; state.studentId = btn.dataset.openStudent; draw() }))
    target.querySelectorAll('[data-crumb-grade]').forEach((btn) => btn.addEventListener('click', () => {
      const grade = btn.dataset.crumbGrade
      if (!grade) { state.level = 'grade'; state.grade = null; state.classId = null; state.studentId = null } else { state.level = 'class'; state.grade = grade; state.classId = null; state.studentId = null }
      draw()
    }))
    target.querySelectorAll('[data-crumb-class]').forEach((btn) => btn.addEventListener('click', () => { state.level = 'student'; state.classId = btn.dataset.crumbClass; state.studentId = null; draw() }))
    target.querySelectorAll('[data-view-homework]').forEach((btn) => btn.addEventListener('click', (event) => { event.stopPropagation(); const found = rows.find((r) => r.id === btn.dataset.viewHomework); if (found) openHomeworkDetail(found) }))
    target.querySelectorAll('[data-delete-homework]').forEach((btn) => btn.addEventListener('click', (event) => { event.stopPropagation(); deleteHomework(btn.dataset.deleteHomework) }))
  }
  draw()
}

// ===== 校区管理（owner/admin，软删除） =====
async function renderCampusAdmin(filter = 'active') {
  const target = document.querySelector('#section-content')
  const orgId = appContext.organization.id
  const isArchived = filter === 'archived'
  const { data: campuses, error } = await supabase.from('campuses').select('id, name, code, address, contact_phone, status, created_at').eq('organization_id', orgId).eq('status', filter).order('created_at', { ascending: true })
  logSupabaseResult('campus.admin.list', campuses, error)
  if (error) {
    target.innerHTML = `<div class="error-state"><strong>无法读取校区数据</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    return
  }
  const list = campuses || []
  const ids = list.map((c) => c.id)
  const studentCounts = {}
  const teacherCounts = {}
  if (ids.length) {
    const [{ data: students }, { data: members }] = await Promise.all([
      supabase.from('students').select('campus_id').eq('organization_id', orgId).in('campus_id', ids).is('deleted_at', null).neq('status', 'left'),
      supabase.from('campus_members').select('campus_id').in('campus_id', ids)
    ])
    for (const s of (students || [])) studentCounts[s.campus_id] = (studentCounts[s.campus_id] || 0) + 1
    for (const m of (members || [])) teacherCounts[m.campus_id] = (teacherCounts[m.campus_id] || 0) + 1
  }
  const canManage = can('manage_campus')
  const actionsFor = (c) => {
    if (!canManage) return ''
    if (isArchived) return `<div class="table-actions"><button class="secondary-button table-action" data-restore-campus="${escapeHtml(c.id)}">恢复</button></div>`
    const toggle = c.status === 'active'
      ? `<button class="secondary-button table-action leave-action" data-toggle-campus="${escapeHtml(c.id)}" data-to="disabled">停用</button>`
      : `<button class="secondary-button table-action" data-toggle-campus="${escapeHtml(c.id)}" data-to="active">启用</button>`
    return `<div class="table-actions"><button class="secondary-button table-action" data-edit-campus="${escapeHtml(c.id)}">编辑</button>${toggle}<button class="secondary-button table-action leave-action" data-delete-campus="${escapeHtml(c.id)}" data-delete-campus-name="${escapeHtml(c.name)}">删除</button></div>`
  }
  const rowsHtml = list.length
    ? list.map((c) => `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.address || '未填写')}</td><td>${statusBadge(c.status)}</td><td>${formatDate(c.created_at)}</td><td>${studentCounts[c.id] ?? 0}</td><td>${teacherCounts[c.id] ?? 0}</td><td>${actionsFor(c)}</td></tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state"><span class="empty-symbol">${icon('school')}</span><h3>暂无校区</h3><p>点击右上角「新增校区」创建第一个校区。</p></div></td></tr>`
  const filterToggle = `<button class="secondary-button" data-campus-filter="${isArchived ? 'active' : 'archived'}">${isArchived ? '查看当前' : '查看已归档'}</button>`

  target.innerHTML = `<div class="list-toolbar"><div><strong>${list.length}</strong><span>${isArchived ? '个已归档校区' : '个校区'}</span></div>${filterToggle}${canManage && !isArchived ? '<button class="primary-button" data-add-campus>新增校区</button>' : ''}</div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>校区名称</th><th>地址</th><th>状态</th><th>创建时间</th><th>学生数量</th><th>教师数量</th><th>操作</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
  target.querySelector('[data-campus-filter]')?.addEventListener('click', (e) => renderCampusAdmin(e.currentTarget.dataset.campusFilter))
  target.querySelector('[data-add-campus]')?.addEventListener('click', () => openCampusForm())
  target.querySelectorAll('[data-edit-campus]').forEach((btn) => btn.addEventListener('click', () => openCampusForm(btn.dataset.editCampus)))
  target.querySelectorAll('[data-toggle-campus]').forEach((btn) => btn.addEventListener('click', () => toggleCampusStatus(btn.dataset.toggleCampus, btn.dataset.to)))
  target.querySelectorAll('[data-delete-campus]').forEach((btn) => btn.addEventListener('click', () => deleteCampus(btn.dataset.deleteCampus, btn.dataset.deleteCampusName)))
  target.querySelectorAll('[data-restore-campus]').forEach((btn) => btn.addEventListener('click', () => restoreCampus(btn.dataset.restoreCampus)))
}

// ===== 班级管理（owner/admin，按校区分组，含教师管理） =====
async function renderClassAdmin(filter = 'active') {
  const target = document.querySelector('#section-content')
  const orgId = appContext.organization.id
  const isArchived = filter === 'archived'
  const { data: classes, error } = await supabase.from('classes').select('id, name, grade, school_year, status, campus_id, campuses(name)').eq('organization_id', orgId).eq('status', filter).order('name')
  logSupabaseResult('class.admin.list', classes, error)
  if (error) {
    target.innerHTML = `<div class="error-state"><strong>无法读取班级数据</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    return
  }
  const list = classes || []
  const ids = list.map((c) => c.id)
  const studentCounts = {}
  const teacherCounts = {}
  if (ids.length) {
    const [{ data: enrollments }, { data: teachers }] = await Promise.all([
      supabase.from('student_class_enrollments').select('class_id').in('class_id', ids).eq('is_current', true),
      supabase.from('class_teachers').select('class_id').in('class_id', ids)
    ])
    for (const e of (enrollments || [])) studentCounts[e.class_id] = (studentCounts[e.class_id] || 0) + 1
    for (const t of (teachers || [])) teacherCounts[t.class_id] = (teacherCounts[t.class_id] || 0) + 1
  }
  const canManage = can('manage_class')
  const groups = new Map()
  for (const c of list) {
    const campusName = c.campuses?.name || '未设置校区'
    if (!groups.has(campusName)) groups.set(campusName, [])
    groups.get(campusName).push(c)
  }
  const actionCell = (c) => {
    if (!canManage) return ''
    if (isArchived) return `<div class="table-actions"><button class="secondary-button table-action" data-restore-class="${escapeHtml(c.id)}">恢复</button></div>`
    const toggle = c.status === 'active'
      ? `<button class="secondary-button table-action leave-action" data-toggle-class="${escapeHtml(c.id)}" data-to="disabled">停用</button>`
      : `<button class="secondary-button table-action" data-toggle-class="${escapeHtml(c.id)}" data-to="active">启用</button>`
    return `<div class="table-actions"><button class="secondary-button table-action" data-edit-class="${escapeHtml(c.id)}">编辑</button><button class="secondary-button table-action" data-class-teachers="${escapeHtml(c.id)}">教师</button>${toggle}<button class="secondary-button table-action leave-action" data-delete-class="${escapeHtml(c.id)}" data-delete-class-name="${escapeHtml(c.name)}">删除</button></div>`
  }
  const groupHtml = Array.from(groups.entries()).map(([campusName, rows]) => {
    const body = rows.map((c) => `<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.grade)}</td><td>${statusBadge(c.status)}</td><td>${studentCounts[c.id] ?? 0}</td><td>${teacherCounts[c.id] ?? 0}</td><td>${actionCell(c)}</td></tr>`).join('')
    return `<div class="class-campus-group"><div class="class-campus-heading"><strong>${escapeHtml(campusName)}</strong><span>${rows.length} 个班级</span></div><table class="data-table"><thead><tr><th>班级名称</th><th>年级</th><th>状态</th><th>学生数量</th><th>教师数量</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`
  }).join('')
  const filterToggle = `<button class="secondary-button" data-class-filter="${isArchived ? 'active' : 'archived'}">${isArchived ? '查看当前' : '查看已归档'}</button>`
  target.innerHTML = `<div class="list-toolbar"><div><strong>${list.length}</strong><span>${isArchived ? '个已归档班级' : '个班级'}</span></div>${filterToggle}${canManage && !isArchived ? '<button class="primary-button" data-add-class>新增班级</button>' : ''}</div>${list.length ? groupHtml : `<div class="empty-state"><span class="empty-symbol">${icon('book')}</span><h3>暂无班级</h3><p>点击右上角「新增班级」创建第一个班级。</p></div>`}`
  target.querySelector('[data-class-filter]')?.addEventListener('click', (e) => renderClassAdmin(e.currentTarget.dataset.classFilter))
  target.querySelector('[data-add-class]')?.addEventListener('click', () => openClassForm())
  target.querySelectorAll('[data-edit-class]').forEach((btn) => btn.addEventListener('click', () => openClassForm(list.find((c) => c.id === btn.dataset.editClass))))
  target.querySelectorAll('[data-class-teachers]').forEach((btn) => btn.addEventListener('click', () => openClassTeachers(btn.dataset.classTeachers)))
  target.querySelectorAll('[data-toggle-class]').forEach((btn) => btn.addEventListener('click', () => toggleClassStatus(btn.dataset.toggleClass, btn.dataset.to)))
  target.querySelectorAll('[data-delete-class]').forEach((btn) => btn.addEventListener('click', () => deleteClass(btn.dataset.deleteClass, btn.dataset.deleteClassName)))
  target.querySelectorAll('[data-restore-class]').forEach((btn) => btn.addEventListener('click', () => restoreClass(btn.dataset.restoreClass)))
}

async function restoreClass(classId) {
  if (!classId || !isValidUuid(classId)) { showToast('无法恢复：班级标识无效。', 'error'); return }
  const { error } = await supabase.from('classes').update({ status: 'active' }).eq('id', classId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('class.restore', null, error)
  if (error) { showToast(error.message || '恢复失败，请稍后重试。', 'error'); return }
  showToast('班级已恢复')
  await loadSection()
}

async function restoreCampus(campusId) {
  if (!campusId || !isValidUuid(campusId)) { showToast('无法恢复：校区标识无效。', 'error'); return }
  const { error } = await supabase.from('campuses').update({ status: 'active' }).eq('id', campusId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('campus.restore', null, error)
  if (error) { showToast(error.message || '恢复失败，请稍后重试。', 'error'); return }
  showToast('校区已恢复')
  await loadSection()
}

async function restoreTeacher(memberId) {
  if (!memberId || !isValidUuid(memberId)) { showToast('无法恢复：教师标识无效。', 'error'); return }
  const { error } = await supabase.from('organization_members').update({ status: 'active' }).eq('id', memberId)
  logSupabaseResult('teacher.restore', null, error)
  if (error) { showToast(error.message || '恢复失败，请稍后重试。', 'error'); return }
  showToast('教师已恢复')
  await loadSection()
}

async function toggleClassStatus(classId, toStatus) {
  const { error } = await supabase.from('classes').update({ status: toStatus }).eq('id', classId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('class.toggle', null, error)
  showToast(error ? (error.message || '操作失败，请稍后重试。') : (toStatus === 'active' ? '班级已启用' : '班级已停用'), error ? 'error' : 'success')
  await loadSection()
}

async function openClassTeachers(classId) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.classTeachersModal = 'true'
  modal.dataset.classId = classId
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>班级教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-teachers>×</button></div><div class="loading-state">正在读取教师...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-class-teachers]').addEventListener('click', () => modal.remove())
  const load = async () => {
    const [{ data: current }, { data: all }] = await Promise.all([
      supabase.from('class_teachers').select('teacher_id, is_primary, profiles(real_name, phone)').eq('class_id', classId),
      supabase.from('organization_members').select('user_id, profiles(real_name, phone)').eq('organization_id', appContext.organization.id).eq('role', 'teacher').eq('status', 'active')
    ])
    const currentList = current || []
    const currentIds = new Set(currentList.map((c) => c.teacher_id))
    const availableList = (all || []).filter((a) => !currentIds.has(a.user_id))
    const rowsHtml = currentList.length
      ? currentList.map((t) => `<div class="teacher-manage-row"><div class="teacher-manage-info"><strong>${escapeHtml(t.profiles?.real_name || '未设置姓名')}</strong><small>${escapeHtml(t.profiles?.phone || '')}${t.is_primary ? ' · 主教师' : ''}</small></div><div class="table-actions">${!t.is_primary ? `<button class="secondary-button table-action" data-set-primary="${escapeHtml(t.teacher_id)}">设为主教师</button>` : ''}<button class="secondary-button table-action leave-action" data-remove-teacher="${escapeHtml(t.teacher_id)}">移除</button></div></div>`).join('')
      : '<div class="detail-empty">暂无教师，请在下方添加。</div>'
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>班级教师</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-teachers>×</button></div><div class="teacher-manage-list">${rowsHtml}</div><div class="teacher-add-row"><select data-add-teacher-select>${availableList.length ? `<option value="">请选择要添加的教师</option>${availableList.map((a) => `<option value="${escapeHtml(a.user_id)}">${escapeHtml(a.profiles?.real_name || '未设置姓名')}</option>`).join('')}` : '<option value="">暂无可添加的教师</option>'}</select><button class="primary-button" data-add-teacher>添加教师</button></div>`
    modal.querySelector('[data-close-class-teachers]').addEventListener('click', () => modal.remove())
    modal.querySelector('[data-add-teacher]')?.addEventListener('click', () => addClassTeacher(classId, modal.querySelector('[data-add-teacher-select]').value, load))
    modal.querySelectorAll('[data-remove-teacher]').forEach((btn) => btn.addEventListener('click', () => removeClassTeacher(classId, btn.dataset.removeTeacher, load)))
    modal.querySelectorAll('[data-set-primary]').forEach((btn) => btn.addEventListener('click', () => setPrimaryTeacher(classId, btn.dataset.setPrimary, load)))
  }
  await load()
}

async function addClassTeacher(classId, teacherId, load) {
  if (!teacherId) { showToast('请选择要添加的教师', 'error'); return }
  const { error } = await supabase.from('class_teachers').insert({ class_id: classId, teacher_id: teacherId, is_primary: false })
  logSupabaseResult('class.teacher.add', null, error)
  if (error) { showToast(error.message || '添加失败，请稍后重试。', 'error'); return }
  showToast('教师已添加')
  await load()
}

async function removeClassTeacher(classId, teacherId, load) {
  if (!window.confirm('确定移除该教师吗？')) return
  const { error } = await supabase.from('class_teachers').delete().eq('class_id', classId).eq('teacher_id', teacherId)
  logSupabaseResult('class.teacher.remove', null, error)
  if (error) { showToast(error.message || '移除失败，请稍后重试。', 'error'); return }
  showToast('教师已移除')
  await load()
}

async function setPrimaryTeacher(classId, teacherId, load) {
  const { error: clearErr } = await supabase.from('class_teachers').update({ is_primary: false }).eq('class_id', classId)
  if (clearErr) { showToast(clearErr.message || '操作失败，请稍后重试。', 'error'); return }
  const { error } = await supabase.from('class_teachers').update({ is_primary: true }).eq('class_id', classId).eq('teacher_id', teacherId)
  logSupabaseResult('class.teacher.setPrimary', null, error)
  if (error) { showToast(error.message || '操作失败，请稍后重试。', 'error'); return }
  showToast('已设置主教师')
  await load()
}

// ===== 系统设置（owner/admin）：成员管理 + 个人中心 + 操作日志 =====
async function renderSettings() {
  const target = document.querySelector('#section-content')
  const { data: members, error } = await supabase.from('organization_members').select('id, user_id, role, status, joined_at, profiles(real_name, phone)').eq('organization_id', appContext.organization.id).order('joined_at', { ascending: true })
  logSupabaseResult('settings.members', members, error)
  const list = members || []
  const canManageMembers = can('manage_members')
  const canManageRole = can('manage_member_role')
  const isOwner = appContext.role === 'owner'
  const memberAction = (m) => {
    if (!canManageMembers || m.role === 'owner') return '<span class="muted small">—</span>'
    const actions = []
    const canToggle = isOwner || m.role === 'teacher'
    if (canToggle) {
      actions.push(m.status === 'active'
        ? `<button class="secondary-button table-action leave-action" data-toggle-member="${escapeHtml(m.id)}" data-to="disabled">停用</button>`
        : `<button class="secondary-button table-action" data-toggle-member="${escapeHtml(m.id)}" data-to="active">启用</button>`)
    }
    if (canManageRole && isOwner) {
      actions.push(m.role === 'teacher'
        ? `<button class="secondary-button table-action" data-change-member-role="${escapeHtml(m.id)}" data-role="admin">设为管理员</button>`
        : `<button class="secondary-button table-action" data-change-member-role="${escapeHtml(m.id)}" data-role="teacher">设为老师</button>`)
    }
    const canDelete = isOwner || m.role === 'teacher'
    if (canDelete) actions.push(`<button class="secondary-button table-action leave-action" data-delete-member="${escapeHtml(m.id)}">删除</button>`)
    if (m.role === 'teacher') actions.push(`<button class="secondary-button table-action" data-reset-member-password="${escapeHtml(m.user_id)}">重置密码</button>`)
    return `<div class="table-actions">${actions.join('')}</div>`
  }
  const memberRows = list.length
    ? list.map((m) => `<tr><td><strong>${escapeHtml(m.profiles?.real_name || '未设置姓名')}</strong>${m.user_id === appContext.user.id ? ' <span class="muted small">（我）</span>' : ''}</td><td>${escapeHtml(m.profiles?.phone || '未填写')}</td><td>${roleLabel[m.role] || m.role}</td><td>${statusBadge(m.status)}</td><td>${formatDate(m.joined_at)}</td><td>${memberAction(m)}</td></tr>`).join('')
    : '<tr><td colspan="6"><div class="empty-state"><h3>暂无成员</h3></div></td></tr>'
  target.innerHTML = `<div class="settings-grid"><div class="panel settings-panel"><div class="panel-heading"><div><p class="eyebrow">MEMBERS</p><h3>成员管理</h3></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>手机号</th><th>角色</th><th>状态</th><th>加入时间</th><th>操作</th></tr></thead><tbody>${memberRows}</tbody></table></div></div><div class="panel settings-panel"><div class="panel-heading"><div><p class="eyebrow">ACCOUNT</p><h3>个人中心</h3></div></div><div class="account-line"><div class="large-avatar">${escapeHtml((appContext.profile.real_name || appContext.user.email || '鸿')[0])}</div><div><strong>${escapeHtml(appContext.profile.real_name || '未设置姓名')}</strong><p>${escapeHtml(appContext.user.email || '')}</p></div></div><div class="info-line"><span>角色</span><strong>${roleLabel[appContext.role]}</strong></div><div class="info-line"><span>手机号</span><strong>${escapeHtml(appContext.profile.phone || '未填写')}</strong></div><div class="modal-actions settings-actions"><button class="secondary-button" data-change-password>修改密码</button><button class="primary-button leave-action" data-logout>退出登录 ${icon('logout')}</button></div></div><div class="panel settings-panel"><div class="panel-heading"><div><p class="eyebrow">AUDIT</p><h3>操作日志</h3></div></div><div class="detail-empty">操作日志功能暂未启用（数据库尚无 audit_logs 表）。</div></div></div>`
  target.querySelector('[data-change-password]')?.addEventListener('click', openChangePasswordModal)
  target.querySelector('[data-logout]')?.addEventListener('click', logout)
  target.querySelectorAll('[data-toggle-member]').forEach((btn) => btn.addEventListener('click', () => toggleMemberStatus(btn.dataset.toggleMember, btn.dataset.to)))
  target.querySelectorAll('[data-change-member-role]').forEach((btn) => btn.addEventListener('click', () => changeMemberRole(btn.dataset.changeMemberRole, btn.dataset.role)))
  target.querySelectorAll('[data-delete-member]').forEach((btn) => btn.addEventListener('click', () => deleteMember(btn.dataset.deleteMember)))
  target.querySelectorAll('[data-reset-member-password]').forEach((btn) => btn.addEventListener('click', () => openResetPasswordModal(btn.dataset.resetMemberPassword)))
}

async function toggleMemberStatus(memberId, toStatus) {
  const { error } = await supabase.from('organization_members').update({ status: toStatus }).eq('id', memberId)
  logSupabaseResult('member.toggle', null, error)
  showToast(error ? (error.message || '操作失败，请稍后重试。') : (toStatus === 'active' ? '成员已启用' : '成员已停用'), error ? 'error' : 'success')
  await loadSection()
}

async function changeMemberRole(memberId, role) {
  const { error } = await supabase.from('organization_members').update({ role }).eq('id', memberId)
  logSupabaseResult('member.role', null, error)
  showToast(error ? (error.message || '操作失败，请稍后重试。') : '角色已更新', error ? 'error' : 'success')
  await loadSection()
}

async function deleteMember(memberId) {
  if (!window.confirm('确定删除该成员吗？删除后将无法登录。')) return
  const { error } = await supabase.from('organization_members').update({ status: 'archived' }).eq('id', memberId)
  logSupabaseResult('member.delete', null, error)
  showToast(error ? (error.message || '删除失败，请稍后重试。') : '成员已删除', error ? 'error' : 'success')
  await loadSection()
}

function openChangePasswordModal() {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">个人中心</p><h2>修改密码</h2></div><button class="icon-button" type="button" title="关闭" data-close-password-modal>×</button></div><form data-change-password-form><div class="form-grid"><label>新密码 <span>*</span><input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="至少 6 位" /></label><label>确认新密码 <span>*</span><input name="confirm" type="password" required minlength="6" autocomplete="new-password" placeholder="再次输入" /></label></div><div class="form-error" data-password-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-password-modal>取消</button><button class="primary-button" type="submit">保存密码</button></div></form></div>'
  document.body.append(modal)
  modal.querySelectorAll('[data-close-password-modal]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-change-password-form]').addEventListener('submit', changePassword)
}

async function changePassword(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('.modal-backdrop')
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-password-error]')
  const password = form.get('password')
  const confirm = form.get('confirm')
  if (password.length < 6) { errorTarget.textContent = '密码至少 6 位。'; return }
  if (password !== confirm) { errorTarget.textContent = '两次输入的密码不一致。'; return }
  button.disabled = true
  button.textContent = '保存中...'
  errorTarget.textContent = ''
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    errorTarget.textContent = error.message || '修改失败，请稍后重试。'
    button.disabled = false
    button.textContent = '保存密码'
    return
  }
  modal.remove()
  showToast('密码已修改')
}

async function openCampusForm(campusId = '') {
  const editing = Boolean(campusId)
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.campusModal = 'true'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">组织架构</p><h2>校区</h2></div><button class="icon-button" type="button" title="关闭" data-close-campus-modal>×</button></div><div class="loading-state">正在读取...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-campus-modal]').addEventListener('click', () => modal.remove())
  let campus = null
  if (editing) {
    const { data, error } = await supabase.from('campuses').select('id, name, address, status').eq('id', campusId).single()
    logSupabaseResult('campus.form.load', data, error)
    if (error || !data) {
      modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">组织架构</p><h2>校区</h2></div><button class="icon-button" type="button" title="关闭" data-close-campus-modal>×</button></div><div class="error-state"><strong>无法读取校区</strong><p>${escapeHtml(error?.message || '请稍后重试。')}</p></div>`
      modal.querySelector('[data-close-campus-modal]').addEventListener('click', () => modal.remove())
      return
    }
    campus = data
  }
  const title = editing ? '编辑校区' : '新增校区'
  const name = campus?.name || ''
  const address = campus?.address || ''
  const status = campus?.status === 'disabled' ? 'disabled' : 'active'
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">组织架构</p><h2>${title}</h2></div><button class="icon-button" type="button" title="关闭" data-close-campus-modal>×</button></div><form data-campus-form><div class="form-grid"><label>校区名称 <span>*</span><input name="name" required maxlength="50" value="${escapeHtml(name)}" /></label><label>状态 <span>*</span><select name="status" required><option value="active" ${status === 'active' ? 'selected' : ''}>正常</option><option value="disabled" ${status === 'disabled' ? 'selected' : ''}>停用</option></select></label><label class="full-width">地址<input name="address" maxlength="200" value="${escapeHtml(address)}" placeholder="请输入校区地址" /></label></div><div class="form-error" data-campus-form-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-campus-modal>取消</button><button class="primary-button" type="submit">${editing ? '保存修改' : '创建校区'}</button></div></form>`
  modal.querySelectorAll('[data-close-campus-modal]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-campus-form]').addEventListener('submit', (event) => saveCampus(event, campus))
}

async function saveCampus(event, editingCampus = null) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-campus-modal]')
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-campus-form-error]')
  const name = form.get('name').trim()
  const address = form.get('address').trim() || null
  const status = form.get('status')
  if (!name) { errorTarget.textContent = '校区名称为必填。'; return }
  button.disabled = true
  button.textContent = editingCampus ? '保存中...' : '创建中...'
  errorTarget.textContent = ''
  let error = null
  if (editingCampus) {
    const result = await supabase.from('campuses').update({ name, address, status }).eq('id', editingCampus.id)
    error = result.error
    logSupabaseResult('campus.update', null, error)
  } else {
    const code = 'CAMPUS-' + crypto.randomUUID().slice(0, 8).toUpperCase()
    const result = await supabase.from('campuses').insert({ organization_id: appContext.organization.id, name, code, address, status })
    error = result.error
    logSupabaseResult('campus.create', null, error)
  }
  if (error) {
    errorTarget.textContent = error.message || '保存失败，请稍后重试。'
    button.disabled = false
    button.textContent = editingCampus ? '保存修改' : '创建校区'
    return
  }
  modal.remove()
  showToast(editingCampus ? '校区已更新' : '校区已创建')
  await loadSection()
}

async function toggleCampusStatus(campusId, toStatus) {
  const { error } = await supabase.from('campuses').update({ status: toStatus }).eq('id', campusId)
  logSupabaseResult('campus.toggle', null, error)
  showToast(error ? (error.message || '操作失败，请稍后重试。') : (toStatus === 'active' ? '校区已启用' : '校区已停用'), error ? 'error' : 'success')
  await loadSection()
}

async function deleteCampus(campusId, campusName = '') {
  if (!campusId || !isValidUuid(campusId)) { showToast('无法删除：校区标识无效。', 'error'); return }
  if (!window.confirm(`确定删除【${campusName || '该校区'}】吗？\n删除后将归档，历史数据全部保留，可随时恢复。`)) return
  const { error } = await supabase.from('campuses').update({ status: 'archived' }).eq('id', campusId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('campus.delete', null, error)
  if (error) { showToast(error.message || '删除失败，请稍后重试。', 'error'); return }
  showToast('已归档，可在「已归档」列表中恢复。')
  await loadSection()
}

function getCurrentEnrollment(student) {
  return (student.student_class_enrollments || []).find((enrollment) => enrollment.is_current) || null
}

async function markStudentLeft(studentId) {
  const confirmed = window.confirm('确定将该学生标记为离校吗？离校后将自动解除当前班级关系，历史作业、考勤、缴费记录仍会保留。')
  if (!confirmed) return
  const deletedAt = new Date().toISOString()
  // ① 更新 students 表：status=left，deleted_at=当前时间
  const { data, error } = await supabase.from('students').update({ status: 'left', deleted_at: deletedAt }).eq('id', studentId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('students.leave', data, error)
  if (error) {
    showToast(error.message || '离校操作失败，请稍后重试。', 'error')
    return
  }
  // ② 自动解除当前班级关系：is_current=true → false，end_date=当前时间（避免留下幽灵绑定）
  const { error: enrollmentError } = await supabase
    .from('student_class_enrollments')
    .update({ is_current: false, end_date: new Date().toISOString().slice(0, 10) })
    .eq('student_id', studentId)
    .eq('is_current', true)
  if (enrollmentError) {
    console.error('[markStudentLeft] 解除学生当前班级关系失败。studentId:', studentId, 'error:', enrollmentError.message)
  } else {
    console.info('[markStudentLeft] 已解除学生当前班级关系。studentId:', studentId)
  }
  showToast('学生已离校')
  await loadSection()
}


// ===== 批量导入学生（Excel，前端解析 + 预览 + 确认写入）=====
const BATCH_HEADER_MAP = {
  '姓名': 'real_name', '学生姓名': 'real_name', 'real_name': 'real_name', 'name': 'real_name',
  '年级': 'grade', 'grade': 'grade',
  '班级': 'class_name', '班级名称': 'class_name', 'class_name': 'class_name', 'class': 'class_name',
  '学号': 'student_no', 'student_no': 'student_no',
  '性别': 'gender', 'gender': 'gender',
  '备注': 'note', 'note': 'note', 'internal_note': 'note'
}

function normalizeHeader(header) {
  const s = String(header || '').trim()
  return BATCH_HEADER_MAP[s] || BATCH_HEADER_MAP[s.toLowerCase()] || s
}

function mapRow(rawRow) {
  const row = {}
  for (const [k, v] of Object.entries(rawRow || {})) {
    const key = normalizeHeader(k)
    row[key] = String(v ?? '').trim()
  }
  return row
}

function normalizeGender(value) {
  const v = String(value || '').trim()
  if (v === '男' || v === 'male' || v === 'M') return 'male'
  if (v === '女' || v === 'female' || v === 'F') return 'female'
  if (v === 'unknown' || v === '' ) return 'unknown'
  return null // 非法
}

function openBatchImportModal() {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.batchImportModal = 'true'
  modal.innerHTML = `<div class="modal batch-import-modal"><div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>批量导入学生</h2></div><button class="icon-button" type="button" title="关闭" data-close-batch-import>×</button></div><div class="batch-import-body"><p class="modal-desc">上传 Excel（.xlsx / .xls / .csv）。必填列：姓名、年级、班级；可选：学号、性别、备注。</p><label class="batch-file-label"><input type="file" accept=".xlsx,.xls,.csv" data-batch-file /><span>点击选择 Excel 文件</span></label><div class="batch-template-hint">表头示例：<code>姓名 / 年级 / 班级 / 学号 / 性别 / 备注</code></div><div data-batch-result></div></div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-batch-import]').addEventListener('click', () => modal.remove())
  const fileInput = modal.querySelector('[data-batch-file]')
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) handleBatchFile(modal, file)
  })
}

async function handleBatchFile(modal, file) {
  const resultEl = modal.querySelector('[data-batch-result]')
  resultEl.innerHTML = '<div class="loading-state"><span class="loader"></span>正在解析 Excel...</div>'
  try {
    const buf = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) { resultEl.innerHTML = '<div class="error-state">无法读取工作表，请确认文件格式正确。</div>'; return }
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    const rows = rawRows.map(mapRow)
    if (!rows.length) { resultEl.innerHTML = '<div class="error-state">文件为空或没有数据行。</div>'; return }
    // 载入班级 + 已存在学号
    const [{ data: classes }, { data: existingStudents }] = await Promise.all([
      supabase.from('classes').select('id, name, grade, campus_id, organization_id, school_year, status').eq('organization_id', appContext.organization.id).eq('status', 'active'),
      supabase.from('students').select('student_no').eq('organization_id', appContext.organization.id).is('deleted_at', null).neq('status', 'left')
    ])
    const existingNos = new Set((existingStudents || []).map((s) => s.student_no).filter(Boolean))
    const classMap = {}
    for (const c of (classes || [])) {
      const key = `${c.name}|${c.grade}`
      ;(classMap[key] = classMap[key] || []).push(c)
    }
    const seenNos = new Set()
    const validRows = []
    const errors = []
    rows.forEach((row, idx) => {
      const line = idx + 2
      const errs = validateBatchRow(row, classMap, existingNos, seenNos)
      if (errs.length) {
        errors.push({ line, name: row.real_name || '(空)', errors: errs })
      } else {
        const cls = classMap[`${row.class_name}|${row.grade}`][0]
        validRows.push({ real_name: row.real_name, grade: row.grade, student_no: row.student_no || null, gender: normalizeGender(row.gender) ?? 'unknown', internal_note: row.note || null, class_id: cls.id, campus_id: cls.campus_id })
      }
    })
    batchImportValidRows = validRows
    renderBatchPreview(resultEl, { total: rows.length, valid: validRows.length, errors })
  } catch (err) {
    resultEl.innerHTML = `<div class="error-state">解析失败：${escapeHtml(err?.message || String(err))}</div>`
  }
}

function validateBatchRow(row, classMap, existingNos, seenNos) {
  const errs = []
  if (!row.real_name) errs.push('姓名为空')
  if (!row.grade) errs.push('年级为空')
  if (!row.class_name) errs.push('班级为空')
  else {
    const key = `${row.class_name}|${row.grade}`
    const matches = classMap[key] || []
    if (!matches.length) errs.push('班级不存在')
    else if (matches.length > 1) errs.push('班级不唯一（多个校区同名同年级，请细化）')
  }
  if (row.gender && normalizeGender(row.gender) === null) errs.push('性别格式错误')
  if (row.student_no) {
    if (existingNos.has(row.student_no)) errs.push('学号已存在（重复学生）')
    else if (seenNos.has(row.student_no)) errs.push('文件内学号重复')
    else seenNos.add(row.student_no)
  }
  return errs
}

function renderBatchPreview(resultEl, summary) {
  const { total, valid, errors } = summary
  const errHtml = errors.length
    ? `<div class="batch-error-list"><h4>错误明细（${errors.length} 条）</h4>${errors.map((e) => `<div class="batch-error-row"><span>第 ${e.line} 行 · ${escapeHtml(e.name)}</span><em>${escapeHtml(e.errors.join('、'))}</em></div>`).join('')}</div>`
    : ''
  resultEl.innerHTML = `<div class="batch-summary"><div class="batch-count"><strong>${total}</strong><span>共</span></div><div class="batch-count ok"><strong>${valid}</strong><span>成功</span></div><div class="batch-count err"><strong>${errors.length}</strong><span>错误</span></div></div>${errHtml}${valid ? `<div class="modal-actions"><button class="primary-button" data-confirm-batch-import>确认导入 ${valid} 条</button></div>` : ''}`
  resultEl.querySelector('[data-confirm-batch-import]')?.addEventListener('click', () => confirmBatchImport(resultEl))
}

async function confirmBatchImport(resultEl) {
  const rows = batchImportValidRows
  if (!rows.length) return
  const button = resultEl.querySelector('[data-confirm-batch-import]')
  if (button) { button.disabled = true; button.textContent = '导入中...' }
  // 1) 批量插入 students
  const studentRows = rows.map((r) => ({ organization_id: appContext.organization.id, campus_id: r.campus_id, real_name: r.real_name, grade: r.grade, student_no: r.student_no, gender: r.gender, internal_note: r.internal_note, status: 'active' }))
  const { data: created, error: studentErr } = await supabase.from('students').insert(studentRows).select('id, student_no')
  logSupabaseResult('students.batchImport', created, studentErr)
  if (studentErr) {
    if (button) { button.disabled = false; button.textContent = `确认导入 ${rows.length} 条` }
    showToast(studentErr.message || '导入失败，请稍后重试。', 'error')
    return
  }
  // 2) 批量插入 enrollments
  const enrollmentRows = (created || []).map((s, i) => ({ student_id: s.id, class_id: rows[i].class_id, campus_id: rows[i].campus_id, start_date: new Date().toISOString().slice(0, 10), is_current: true }))
  const { error: enrollErr } = await supabase.from('student_class_enrollments').insert(enrollmentRows)
  logSupabaseResult('students.batchImport.enrollments', null, enrollErr)
  if (enrollErr) {
    showToast(`学生已导入，但班级绑定失败：${enrollErr.message}`, 'error')
  } else {
    showToast(`成功导入 ${(created || []).length} 名学生`)
  }
  batchImportValidRows = []
  const modal = resultEl.closest('[data-batch-import-modal]')
  modal?.remove()
  await loadSection()
}




async function openStudentForm(student = null) {
  const isEditing = Boolean(student)
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.studentModal = 'true'
  modal.dataset.studentId = student?.id || ''
  modal.dataset.enrollments = JSON.stringify(student?.student_class_enrollments || [])
  modal.innerHTML = `<div class="modal"><div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${isEditing ? '编辑学生' : '新增学生'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-student-modal>×</button></div><div class="loading-state">正在读取校区...</div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-student-modal]').addEventListener('click', () => modal.remove())

  const { data: campuses, error } = await supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).neq('status', 'archived').order('name')
  logSupabaseResult('students.create.campuses', campuses, error)
  if (error) {
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${isEditing ? '编辑学生' : '新增学生'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-student-modal>×</button></div><div class="error-state"><strong>无法读取校区</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    modal.querySelector('[data-close-student-modal]').addEventListener('click', () => modal.remove())
    return
  }

  const value = (field) => escapeHtml(student?.[field] || '')
  const currentEnrollment = getCurrentEnrollment(student || {})
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${isEditing ? '编辑学生' : '新增学生'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-student-modal>×</button></div><form data-student-form><div class="form-grid"><label>姓名 <span>*</span><input name="real_name" required maxlength="100" value="${value('real_name')}" /></label><label>学号<input name="student_no" maxlength="50" value="${value('student_no')}" /></label><label>性别<select name="gender"><option value="unknown" ${student?.gender === 'unknown' || !student ? 'selected' : ''}>未设置</option><option value="male" ${student?.gender === 'male' ? 'selected' : ''}>男</option><option value="female" ${student?.gender === 'female' ? 'selected' : ''}>女</option></select></label><label>出生日期<input name="birthday" type="date" value="${value('birthday')}" /></label><label>年级 <span>*</span><input name="grade" required maxlength="50" value="${value('grade')}" /></label><label>学校<input name="school_name" maxlength="150" value="${value('school_name')}" /></label><label>校区 <span>*</span><select name="campus_id" required><option value="">请选择校区</option>${(campuses || []).map((campus) => `<option value="${escapeHtml(campus.id)}" ${student?.campus_id === campus.id ? 'selected' : ''}>${escapeHtml(campus.name)}</option>`).join('')}</select></label><label>班级<select name="class_id" data-class-select ${student?.campus_id ? '' : 'disabled'}><option value="">未分配</option></select></label><label>状态<select name="status"><option value="active" ${student?.status === 'active' || !student ? 'selected' : ''}>正常</option><option value="paused" ${student?.status === 'paused' ? 'selected' : ''}>暂停</option><option value="graduated" ${student?.status === 'graduated' ? 'selected' : ''}>已毕业</option><option value="left" ${student?.status === 'left' ? 'selected' : ''}>已离校</option></select></label><label class="full-width">健康备注<textarea name="health_note" rows="3">${value('health_note')}</textarea></label><label class="full-width">内部备注<textarea name="internal_note" rows="3">${value('internal_note')}</textarea></label></div><div class="form-error" data-student-form-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-student-modal>取消</button><button class="primary-button" type="submit">保存学生</button></div></form>`
  modal.querySelectorAll('[data-close-student-modal]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  const campusSelect = modal.querySelector('[name="campus_id"]')
  campusSelect.addEventListener('change', () => loadClassOptions(modal, campusSelect.value))
  await loadClassOptions(modal, campusSelect.value, currentEnrollment?.class_id)
  modal.querySelector('[data-student-form]').addEventListener('submit', saveStudent)
}

async function loadClassOptions(modal, campusId, selectedClassId = '') {
  const classSelect = modal.querySelector('[data-class-select]')
  classSelect.innerHTML = '<option value="">正在读取班级...</option>'
  classSelect.disabled = !campusId
  if (!campusId) {
    classSelect.innerHTML = '<option value="">未分配</option>'
    return
  }
  const { data: classes, error } = await supabase.from('classes').select('id, name, grade, school_year, campuses(name)').eq('organization_id', appContext.organization.id).eq('campus_id', campusId).eq('status', 'active').order('name')
  logSupabaseResult('students.form.classes', classes, error)
  if (error) {
    classSelect.innerHTML = '<option value="">无法读取班级</option>'
    classSelect.disabled = true
    return
  }
  classSelect.innerHTML = `<option value="">未分配</option>${(classes || []).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedClassId ? 'selected' : ''}>${escapeHtml(item.campuses?.name || '')} · ${escapeHtml(item.name)}${item.grade ? ` · ${escapeHtml(item.grade)}` : ''}</option>`).join('')}`
  classSelect.disabled = false
}

async function saveStudent(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-student-form-error]')
  button.disabled = true
  button.textContent = '保存中...'
  errorTarget.textContent = ''
  const payload = {
    real_name: form.get('real_name').trim(),
    student_no: form.get('student_no').trim() || null,
    gender: form.get('gender'),
    birthday: form.get('birthday') || null,
    grade: form.get('grade').trim(),
    school_name: form.get('school_name').trim() || null,
    campus_id: form.get('campus_id'),
    status: form.get('status'),
    health_note: form.get('health_note').trim() || null,
    internal_note: form.get('internal_note').trim() || null
  }
  const classId = form.get('class_id') || null
  const campusId = form.get('campus_id')
  const modal = formElement.closest('[data-student-modal]')
  const studentId = modal.dataset.studentId
  // 学号占位预检：同机构下、剔除本人、非离校、未删除的学生中是否已占用该学号
  if (payload.student_no) {
    let noQuery = supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', appContext.organization.id)
      .eq('student_no', payload.student_no)
      .neq('status', 'left')
      .is('deleted_at', null)
    if (studentId) noQuery = noQuery.neq('id', studentId)
    const { count: noUsed, error: noCheckError } = await noQuery
    logSupabaseResult('students.no_check', { count: noUsed }, noCheckError)
    if (!noCheckError && (noUsed || 0) > 0) {
      errorTarget.textContent = '该学号已被在校学生使用'
      button.disabled = false
      button.textContent = '保存学生'
      return
    }
  }
  let data
  let error
  if (studentId) {
    ({ data, error } = await supabase.from('students').update(payload).eq('id', studentId).eq('organization_id', appContext.organization.id))
    logSupabaseResult('students.update', data, error)
    if (!error) ({ error } = await syncStudentEnrollment(studentId, classId, campusId, getCurrentEnrollment({ student_class_enrollments: JSON.parse(modal.dataset.enrollments || '[]') })))
  } else {
    const generatedStudentId = crypto.randomUUID();
    ({ data, error } = await supabase.from('students').insert({ id: generatedStudentId, organization_id: appContext.organization.id, ...payload }))
    logSupabaseResult('students.create', data, error)
    if (!error && classId) ({ error } = await createStudentEnrollment(generatedStudentId, classId, campusId))
  }
  if (error) {
    // 捕获数据库 unique 约束错误（学号重复），转换为用户可理解提示
    const isDuplicate = error.code === '23505' || /duplicate key/i.test(error.message || '')
    errorTarget.textContent = isDuplicate ? '该学号已被在校学生使用' : (error.message || '保存失败，请稍后重试。')
    button.disabled = false
    button.textContent = '保存学生'
    return
  }
  formElement.closest('[data-student-modal]').remove()
  showToast(studentId ? '学生保存成功' : '学生添加成功')
  await loadSection()
}

async function createStudentEnrollment(studentId, classId, campusId) {
  const { error } = await supabase.from('student_class_enrollments').insert({ student_id: studentId, class_id: classId, campus_id: campusId, start_date: new Date().toISOString().slice(0, 10), is_current: true })
  logSupabaseResult('student_class_enrollments.create', null, error)
  return { error }
}

async function syncStudentEnrollment(studentId, classId, campusId, currentEnrollment) {
  if (currentEnrollment?.class_id === classId && currentEnrollment?.campus_id === campusId) return { error: null }
  const today = new Date().toISOString().slice(0, 10)
  if (currentEnrollment) {
    const { error } = await supabase.from('student_class_enrollments').update({ is_current: false, end_date: today }).eq('id', currentEnrollment.id)
    logSupabaseResult('student_class_enrollments.close', null, error)
    if (error) return { error }
  }
  if (classId) return createStudentEnrollment(studentId, classId, campusId)
  return { error: null }
}

// ===== 学生转班/调班（复用 syncStudentEnrollment：关旧 + 开新，保留历史）=====
async function openChangeClassModal(student, currentEnrollment) {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.changeClassModal = 'true'
  modal.studentId = student.id
  modal.currentEnrollment = currentEnrollment || null
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>调整班级</h2></div><button class="icon-button" type="button" title="关闭" data-close-change-class>×</button></div><div class="loading-state">正在读取校区与班级...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-change-class]').addEventListener('click', () => modal.remove())
  const [{ data: campuses, error: cErr }, { data: classes, error: kErr }] = await Promise.all([
    supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).neq('status', 'archived').order('name'),
    supabase.from('classes').select('id, name, grade, campus_id').eq('organization_id', appContext.organization.id).eq('status', 'active').order('name')
  ])
  if (cErr || kErr) {
    modal.querySelector('.modal').innerHTML = '<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>调整班级</h2></div><button class="icon-button" type="button" title="关闭" data-close-change-class>×</button></div><div class="error-state"><strong>无法读取数据</strong><p>请稍后重试。</p></div>'
    modal.querySelector('[data-close-change-class]').addEventListener('click', () => modal.remove())
    return
  }
  const curCampusId = currentEnrollment?.campus_id || student.campus_id || ''
  const curClassId = currentEnrollment?.class_id || ''
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>调整班级</h2><p class="muted">调整后旧班级转为历史记录，历史作业/批改/考勤不受影响。</p></div><button class="icon-button" type="button" title="关闭" data-close-change-class>×</button></div><form data-change-class-form><div class="form-grid"><label>所属校区 <span>*</span><select name="campus_id" data-change-campus required><option value="">请选择校区</option>${(campuses || []).map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === curCampusId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label><label>新班级 <span>*</span><select name="class_id" data-class-select ${curCampusId ? '' : 'disabled'}><option value="">请选择班级</option></select></label></div><div class="form-error" data-change-class-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-change-class>取消</button><button class="primary-button" type="submit">确认调整</button></div></form>`
  modal.querySelectorAll('[data-close-change-class]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  const campusSelect = modal.querySelector('[data-change-campus]')
  campusSelect.addEventListener('change', () => loadClassOptions(modal, campusSelect.value))
  await loadClassOptions(modal, curCampusId, curClassId)
  modal.querySelector('[data-change-class-form]').addEventListener('submit', saveChangeClass)
}

async function saveChangeClass(event) {
  event.preventDefault()
  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const modal = formElement.closest('[data-change-class-modal]')
  const studentId = modal.studentId
  const currentEnrollment = modal.currentEnrollment
  const button = formElement.querySelector('button[type="submit"]')
  const errorTarget = formElement.querySelector('[data-change-class-error]')
  const campusId = form.get('campus_id')
  const classId = form.get('class_id')
  if (!campusId || !classId) { errorTarget.textContent = '请选择校区和新班级。'; return }
  if (currentEnrollment?.class_id === classId && currentEnrollment?.campus_id === campusId) {
    errorTarget.textContent = '目标班级与当前班级相同，无需调整。'
    return
  }
  button.disabled = true
  button.textContent = '调整中...'
  errorTarget.textContent = ''
  const { error } = await syncStudentEnrollment(studentId, classId, campusId, currentEnrollment)
  if (error) {
    errorTarget.textContent = error.message || '调整失败，请稍后重试。'
    button.disabled = false
    button.textContent = '确认调整'
    return
  }
  modal.remove()
  document.querySelector('[data-student-detail]')?.remove()
  showToast('班级已调整')
  await loadSection()
}

// ===== 批量升年级（按班序号匹配：X年Y班 → 目标年Y班）=====
function classSuffix(name, grade) {
  const n = String(name || '').trim()
  const g = String(grade || '').trim()
  if (g && n.startsWith(g)) return n.slice(g.length)
  return n
}

async function openGradePromotionModal() {
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.gradePromotionModal = 'true'
  modal.innerHTML = '<div class="modal"><div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>批量升年级</h2></div><button class="icon-button" type="button" title="关闭" data-close-grade-promotion>×</button></div><div class="loading-state">正在读取年级...</div></div>'
  document.body.append(modal)
  modal.querySelector('[data-close-grade-promotion]').addEventListener('click', () => modal.remove())
  const { data: classes, error } = await supabase.from('classes').select('id, name, grade').eq('organization_id', appContext.organization.id).eq('status', 'active').order('grade')
  if (error) {
    modal.querySelector('.modal').innerHTML = '<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>批量升年级</h2></div><button class="icon-button" type="button" title="关闭" data-close-grade-promotion>×</button></div><div class="error-state"><strong>无法读取年级</strong><p>请稍后重试。</p></div>'
    modal.querySelector('[data-close-grade-promotion]').addEventListener('click', () => modal.remove())
    return
  }
  const grades = [...new Set((classes || []).map((c) => c.grade).filter(Boolean))]
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>批量升年级</h2></div><button class="icon-button" type="button" title="关闭" data-close-grade-promotion>×</button></div><form data-grade-promotion-form><div class="form-grid"><label>源年级 <span>*</span><select name="src_grade" required><option value="">请选择</option>${grades.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}</select></label><label>目标年级 <span>*</span><input name="dst_grade" required placeholder="如：四年（需与班级 grade 一致）" /></label></div><div class="batch-template-hint">按班序号匹配：如「三年一班」→ 目标年级的「一班」。目标年级班级需已存在，否则提示「没有对应目标班级」。</div><div class="form-error" data-grade-promotion-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-grade-promotion>取消</button><button class="primary-button" type="submit" data-grade-promotion-preview>预览</button></div></form><div data-grade-promotion-result></div>`
  modal.querySelectorAll('[data-close-grade-promotion]').forEach((button) => button.addEventListener('click', () => modal.remove()))
  modal.querySelector('[data-grade-promotion-form]').addEventListener('submit', (event) => { event.preventDefault(); previewGradePromotion(modal) })
}

async function previewGradePromotion(modal) {
  const form = modal.querySelector('[data-grade-promotion-form]')
  const srcGrade = form.querySelector('[name="src_grade"]').value.trim()
  const dstGrade = form.querySelector('[name="dst_grade"]').value.trim()
  const errorTarget = form.querySelector('[data-grade-promotion-error]')
  const resultEl = modal.querySelector('[data-grade-promotion-result]')
  errorTarget.textContent = ''
  if (!srcGrade || !dstGrade) { errorTarget.textContent = '请填写源年级与目标年级。'; return }
  resultEl.innerHTML = '<div class="loading-state"><span class="loader"></span>正在预览...</div>'
  const [{ data: classes }, { data: students }] = await Promise.all([
    supabase.from('classes').select('id, name, grade, campus_id, status').eq('organization_id', appContext.organization.id).eq('status', 'active'),
    supabase.from('students').select('id, real_name, student_no, grade, campus_id, status, student_class_enrollments(id, class_id, campus_id, is_current, classes(id, name, grade))').eq('organization_id', appContext.organization.id).eq('grade', srcGrade).is('deleted_at', null).neq('status', 'left')
  ])
  const classList = classes || []
  const validRows = []
  const errors = []
  for (const s of (students || [])) {
    const current = (s.student_class_enrollments || []).find((e) => e.is_current)
    if (!current) { errors.push({ name: s.real_name || '(空)', reason: '学生无当前班级' }); continue }
    const curName = current.classes?.name || ''
    const curGrade = current.classes?.grade || ''
    const suffix = classSuffix(curName, curGrade)
    const targetName = dstGrade + suffix
    const target = classList.find((c) => c.campus_id === current.campus_id && c.grade === dstGrade && c.name === targetName)
    if (!target) { errors.push({ name: s.real_name || '(空)', reason: `没有对应目标班级（${targetName}）` }); continue }
    validRows.push({ student: s, current, target, dstGrade })
  }
  modal.promotionValidRows = validRows
  modal.promotionDstGrade = dstGrade
  const total = (students || []).length
  resultEl.innerHTML = `<div class="batch-summary"><div class="batch-count"><strong>${total}</strong><span>共</span></div><div class="batch-count ok"><strong>${validRows.length}</strong><span>成功</span></div><div class="batch-count err"><strong>${errors.length}</strong><span>失败</span></div></div>${errors.length ? `<div class="batch-error-list"><h4>失败明细（${errors.length} 条）</h4>${errors.map((e) => `<div class="batch-error-row"><span>${escapeHtml(e.name)}</span><em>${escapeHtml(e.reason)}</em></div>`).join('')}</div>` : ''}${validRows.length ? `<div class="modal-actions"><button class="primary-button" data-confirm-grade-promotion>确认升级 ${validRows.length} 人</button></div>` : ''}`
  resultEl.querySelector('[data-confirm-grade-promotion]')?.addEventListener('click', () => confirmGradePromotion(modal))
}

async function confirmGradePromotion(modal) {
  const validRows = modal.promotionValidRows || []
  if (!validRows.length) return
  const dstGrade = modal.promotionDstGrade
  const button = modal.querySelector('[data-confirm-grade-promotion]')
  if (button) { button.disabled = true; button.textContent = '升级中...' }
  let okCount = 0
  const failList = []
  for (const row of validRows) {
    const { student, current, target } = row
    // 1) 升年级
    const { error: gradeErr } = await supabase.from('students').update({ grade: dstGrade }).eq('id', student.id)
    if (gradeErr) { failList.push(`${student.real_name}：${gradeErr.message}`); continue }
    // 2) 关旧班 + 开新班（复用转班逻辑）
    const { error: enrollErr } = await syncStudentEnrollment(student.id, target.id, target.campus_id, current)
    if (enrollErr) { failList.push(`${student.real_name}：${enrollErr.message}`); continue }
    okCount += 1
  }
  logSupabaseResult('students.gradePromotion', { okCount, fail: failList.length }, null)
  if (failList.length) showToast(`升级完成：成功 ${okCount}，失败 ${failList.length}（${failList[0]}）`, 'error')
  else showToast(`成功升级 ${okCount} 名学生`)
  modal.remove()
  await loadSection()
}

// ===== 学生档案导出（Excel，复用 XLSX + RLS 权限）=====
const genderLabelMap = { male: '男', female: '女', unknown: '未设置' }
const studentStatusLabelMap = { active: '在读', paused: '暂停', graduated: '已毕业', left: '已离校' }

function studentExportRow(s) {
  const enrollment = (s.student_class_enrollments || []).find((e) => e.is_current)
  return {
    '姓名': s.real_name || '',
    '学号': s.student_no || '',
    '性别': genderLabelMap[s.gender] || '',
    '年级': s.grade || '',
    '校区': s.campuses?.name || '',
    '当前班级': enrollment?.classes?.name || '',
    '状态': studentStatusLabelMap[s.status] || s.status || '',
    '入学日期': s.admission_date || '',
    '备注': s.internal_note || ''
  }
}

function openExportStudentsModal() {
  const isAdmin = can('manage_student')
  const modal = document.createElement('div')
  modal.className = 'modal-backdrop'
  modal.dataset.exportStudentsModal = 'true'
  modal.innerHTML = `<div class="modal"><div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>导出学生</h2></div><button class="icon-button" type="button" title="关闭" data-close-export>×</button></div><div class="export-options">${isAdmin ? `<button class="export-option" data-export-mode="all">导出全部学生</button><button class="export-option" data-export-mode="filtered">导出当前筛选结果</button><button class="export-option" data-export-mode="class">导出单个班级…</button>` : `<button class="export-option" data-export-mode="all">导出我班学生</button>`}</div><div class="export-class-picker" data-export-class-picker hidden><label>班级<select data-export-class></select></label><div class="modal-actions"><button class="primary-button" data-export-class-confirm>导出</button></div></div><div class="export-status" data-export-status></div></div>`
  document.body.append(modal)
  modal.querySelector('[data-close-export]').addEventListener('click', () => modal.remove())
  modal.querySelectorAll('[data-export-mode]').forEach((btn) => btn.addEventListener('click', async () => {
    const mode = btn.dataset.exportMode
    if (mode === 'class') {
      const picker = modal.querySelector('[data-export-class-picker]')
      picker.hidden = false
      const sel = modal.querySelector('[data-export-class]')
      if (!sel.options.length) {
        const { data: classes } = await supabase.from('classes').select('id, name, grade, campus_id, campuses(name)').eq('organization_id', appContext.organization.id).eq('status', 'active').order('name')
        sel.innerHTML = (classes || []).map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.campuses?.name || '')} · ${escapeHtml(c.name)} · ${escapeHtml(c.grade || '')}</option>`).join('')
      }
      return
    }
    await exportStudentsToExcel(mode, null, modal)
  }))
  modal.querySelector('[data-export-class-confirm]')?.addEventListener('click', async () => {
    const classId = modal.querySelector('[data-export-class]').value
    if (classId) await exportStudentsToExcel('class', classId, modal)
  })
}

async function exportStudentsToExcel(mode, classId, modal) {
  const statusEl = modal.querySelector('[data-export-status]')
  statusEl.textContent = '正在导出...'
  const keyword = mode === 'filtered' ? (document.querySelector('[data-student-search]')?.value || '').trim().toLowerCase() : ''
  let builder = supabase
    .from('students')
    .select('real_name, student_no, gender, grade, admission_date, status, internal_note, campuses(name), student_class_enrollments(class_id, is_current, classes(name))')
    .eq('organization_id', appContext.organization.id)
    .is('deleted_at', null)
    .neq('status', 'left')
  const { data, error } = await builder.order('created_at', { ascending: false })
  if (error) { statusEl.textContent = `导出失败：${error.message}`; return }
  let rows = data || []
  if (mode === 'class') {
    rows = rows.filter((s) => (s.student_class_enrollments || []).some((e) => e.is_current && e.class_id === classId))
  } else if (mode === 'filtered' && keyword) {
    rows = rows.filter((s) => (s.real_name || '').toLowerCase().includes(keyword) || (s.student_no || '').toLowerCase().includes(keyword))
  }
  if (!rows.length) { statusEl.textContent = '没有可导出的学生。'; return }
  const exportRows = rows.map(studentExportRow)
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(exportRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '学生档案')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `学生档案_${stamp}.xlsx`)
  statusEl.textContent = `已导出 ${exportRows.length} 名学生。`
}









function renderHomeworkImagePreviews(fileInput, previewContainer) {
  const files = Array.from(fileInput.files || [])
  previewContainer.innerHTML = files.map((file, index) => `<div class="upload-preview-item" data-preview-index="${index}"><img src="${URL.createObjectURL(file)}" alt="${escapeHtml(file.name)}" /><button type="button" class="preview-remove" data-preview-remove="${index}" title="移除">×</button></div>`).join('')
  previewContainer.querySelectorAll('[data-preview-remove]').forEach((button) => button.addEventListener('click', () => {
    const dt = new DataTransfer()
    Array.from(fileInput.files).forEach((file, index) => { if (index !== Number(button.dataset.previewRemove)) dt.items.add(file) })
    fileInput.files = dt.files
    renderHomeworkImagePreviews(fileInput, previewContainer)
  }))
}

async function uploadHomeworkImages(homeworkId, files) {
  const uploaded = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const storagePath = `${homeworkId}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('homework-images').upload(storagePath, file, { contentType: file.type || 'image/jpeg' })
    if (uploadError) return uploadError
    uploaded.push({ storage_path: storagePath, file_name: file.name, mime_type: file.type || 'image/jpeg', size_bytes: file.size, sort_order: index })
  }
  if (!uploaded.length) return null
  const { error } = await supabase.from('homework_attachments').insert(uploaded.map((item) => ({ homework_id: homeworkId, organization_id: appContext.organization.id, uploaded_by: appContext.user.id, ...item })))
  return error || null
}

function getHomeworkImageUrl(storagePath) {
  const { data } = supabase.storage.from('homework-images').getPublicUrl(storagePath)
  return data?.publicUrl || ''
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.append(toast)
  window.setTimeout(() => toast.remove(), 2600)
}

const completionStatusLabel = { not_started: '未开始', partial: '完成中', completed: '已完成', late: '已完成（逾期）' }

function completionStatusBadge(status) {
  return `<span class="status-badge completion-${status || ''}"><i></i>${completionStatusLabel[status] || status || '—'}</span>`
}

function statusBadge(status) {
  const labels = { active: '正常', disabled: '已停用', archived: '已归档', pending: '待批改', corrected: '已批改', needs_revision: '需订正' }
  return `<span class="status-badge ${status || ''}"><i></i>${labels[status] || status || '—'}</span>`
}

supabase?.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) { appContext = null; render() }
})

if (supabase) loadCurrentUser()
else render()

// PWA：注册 Service Worker（仅生产环境，避免干扰开发调试）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[SW] 注册失败', err))
  })
}

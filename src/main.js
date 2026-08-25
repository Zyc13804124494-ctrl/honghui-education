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
  attendance: { label: '考勤管理', eyebrow: '每日出勤', title: '考勤管理', description: '记录和查看班级每日出勤情况。' }
}

const navigation = [
  ['home', '⌂'], ['campuses', '⌑'], ['classes', '▦'], ['teachers', '♧'],
  ['students', '♙'], ['homework', '✓'], ['attendance', '◷'], ['corrections', '✎']
]

let activeSection = 'home'
let appContext = null

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
const formatDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value)) : '—'
const roleLabel = { owner: '超级管理员', admin: '管理员', teacher: '老师' }

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
    check: '<path d="m5 12 4.5 4.5L19 7"/>'
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`
}

function render() {
  if (!isSupabaseConfigured) return renderConfigError()
  if (!appContext) return renderLogin()
  if (appContext.role !== 'owner' && appContext.role !== 'admin') return renderAccessDenied()
  document.querySelector('#app').innerHTML = shell()
  bindShellEvents()
  loadSection()
}

function renderConfigError() {
  document.querySelector('#app').innerHTML = `<div class="center-screen"><div class="notice-card"><span class="notice-mark">!</span><p class="eyebrow">连接配置</p><h1>还没有连接 Supabase</h1><p>请在 <strong>.env.local</strong> 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY，然后重启开发服务器。</p></div></div>`
}

function renderLogin(error = '') {
  document.querySelector('#app').innerHTML = `<div class="login-page"><div class="login-visual"><div class="brand brand-light"><span class="brand-mark">${icon('logo')}</span><span>鸿慧教育</span></div><div class="visual-copy"><p class="eyebrow">HONGHUI EDUCATION</p><h1>让每一次陪伴，<br/>都有清晰的成长记录。</h1><p>统一管理校区、班级与学生学习进度。</p></div><div class="visual-footer">站前校区 · 高新校区</div></div><div class="login-panel"><div class="login-form-wrap"><p class="eyebrow">管理平台</p><h2>欢迎回来</h2><p class="muted">使用鸿慧教育账号登录管理后台。</p>${error ? `<div class="error-banner">${escapeHtml(error)}</div>` : ''}<form data-login-form><label>邮箱<input name="email" type="email" autocomplete="email" required placeholder="请输入邮箱" /></label><label>密码<input name="password" type="password" autocomplete="current-password" required placeholder="请输入密码" /></label><button class="primary-button wide" type="submit">登录管理后台 ${icon('arrow')}</button></form><p class="login-hint">账号权限由鸿慧教育管理员统一管理</p></div></div></div>`
  document.querySelector('[data-login-form]').addEventListener('submit', login)
}

function renderAccessDenied() {
  document.querySelector('#app').innerHTML = `<div class="center-screen"><div class="notice-card"><span class="notice-mark">×</span><p class="eyebrow">访问受限</p><h1>当前账号没有管理员权限</h1><p>请联系鸿慧教育管理员分配 owner 或 admin 权限。</p><button class="secondary-button" data-logout>退出登录 ${icon('logout')}</button></div></div>`
  document.querySelector('[data-logout]').addEventListener('click', logout)
}

function shell() {
  const profileName = appContext.profile?.real_name || appContext.user.email?.split('@')[0] || '鸿慧管理员'
  return `<div class="admin-shell"><aside class="admin-sidebar"><div class="brand"><span class="brand-mark">${icon('logo')}</span><span>鸿慧教育</span></div><div class="workspace-label">管理平台</div><nav>${navigation.map(([key, symbol]) => `<button class="nav-item ${activeSection === key ? 'active' : ''}" data-section="${key}"><span class="nav-symbol">${symbol}</span><span>${sections[key].label}</span></button>`).join('')}</nav><div class="sidebar-foot"><div class="avatar">${escapeHtml(profileName[0])}</div><div class="sidebar-user"><strong>${escapeHtml(profileName)}</strong><small>${roleLabel[appContext.role]}</small></div><span class="online-dot"></span></div></aside><main class="admin-main"><header class="admin-topbar"><div class="mobile-brand"><span class="brand-mark">${icon('logo')}</span>鸿慧教育</div><div class="org-chip"><span class="status-dot"></span>${escapeHtml(appContext.organization.name)}</div><div class="topbar-user"><span>${escapeHtml(profileName)}</span><button class="icon-button" title="退出登录" data-logout>${icon('logout')}</button></div></header><section class="admin-content"><div class="page-heading"><div><p class="eyebrow">${sections[activeSection].eyebrow}</p><h1>${sections[activeSection].title}</h1><p class="muted">${sections[activeSection].description}</p></div><div class="page-date">${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</div></div><div id="section-content"></div></section></main></div>`
}

async function login(event) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const button = event.currentTarget.querySelector('button')
  button.disabled = true
  button.textContent = '登录中...'
  const { data, error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') })
  logSupabaseResult('auth.signInWithPassword', data, error)
  if (error) {
    renderLogin('邮箱或密码错误，请检查后重试。')
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
  document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { activeSection = button.dataset.section; render() }))
  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', logout))
}

async function loadSection() {
  const target = document.querySelector('#section-content')
  if (!target) return
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取云端数据...</div>'
  try {
    if (activeSection === 'home') return renderHome(await getOverview())
    if (activeSection === 'attendance') return renderAttendancePage()
    const queries = {
      campuses: ['campuses', 'id, name, code, address, contact_phone, status, created_at', 'created_at'],
      classes: ['classes', 'id, name, grade, school_year, status, campus_id, campuses(name)', 'created_at'],
      teachers: ['organization_members', 'user_id, role, status, joined_at, profiles(real_name, phone)', 'joined_at'],
      students: ['students', 'id, student_no, real_name, gender, birthday, grade, school_name, status, campus_id, health_note, internal_note, created_at, campuses(name), student_class_enrollments(id, class_id, campus_id, start_date, is_current, classes(id, name, grade, school_year))', 'created_at'],
      homework: ['homework_assignments', 'id, title, subject, content, homework_date, due_date, status, campus_id, class_id, student_id, created_by, created_at, students(real_name, student_no), student_homework_records(completion_status), profiles:created_by(real_name)', 'homework_date'],
      corrections: ['correction_records', 'id, correction_status, score, rating, corrected_at, reviewer_id, profiles(real_name)', 'corrected_at']
    }
    const [table, columns, order] = queries[activeSection]
    const builder = supabase.from(table).select(columns)
    if (table === 'organization_members' || table === 'students' || table === 'classes' || table === 'homework_assignments') builder.eq('organization_id', appContext.organization.id)
    if (table === 'students') builder.is('deleted_at', null).neq('status', 'left')
    const { data, error } = await builder.order(order, { ascending: false })
    logSupabaseResult(`dashboard.${activeSection}`, data, error)
    if (error) throw error
    renderList(data || [])
  } catch (error) {
    target.innerHTML = `<div class="error-state"><strong>暂时无法读取数据</strong><p>${escapeHtml(error.message || '请检查网络连接或账号权限。')}</p><button class="secondary-button" data-retry>重新加载</button></div>`
    target.querySelector('[data-retry]').addEventListener('click', loadSection)
  }
}

async function getOverview() {
  const tables = ['campuses', 'classes', 'students', 'homework_assignments', 'correction_records']
  const results = await Promise.all(tables.map(async (table) => {
    const builder = supabase.from(table).select('*', { count: 'exact', head: true })
    if (table === 'students') builder.is('deleted_at', null).neq('status', 'left')
    const { count, error } = await builder
    logSupabaseResult(`dashboard.overview.${table}`, { count }, error)
    if (error) throw error
    return count || 0
  }))
  return Object.fromEntries(tables.map((table, index) => [table, results[index]]))
}

function renderHome(counts) {
  const target = document.querySelector('#section-content')
  const cards = [['campuses', '校区', 'school', '#e5f6ee', '#2d916c'], ['classes', '班级', 'book', '#e7f0ff', '#3973de'], ['students', '在管学生', 'users', '#fff0dd', '#c87b35'], ['homework_assignments', '作业记录', 'chart', '#eeeafa', '#7564bb'], ['correction_records', '批改记录', 'check', '#e9f5f4', '#398e8b']]
  target.innerHTML = `<div class="welcome-strip"><div><span class="eyebrow">${appContext.role === 'owner' ? 'OWNER WORKSPACE' : 'ADMIN WORKSPACE'}</span><h2>你好，${escapeHtml(appContext.profile.real_name || '鸿慧管理员')}</h2><p>今天也一起，把每一位孩子的成长照顾好。</p></div><div class="welcome-badge">${icon('school')}<span>双校区运营中</span></div></div><div class="overview-grid">${cards.map(([key, label, iconName, background, color]) => `<button class="overview-card" data-section="${key === 'homework_assignments' ? 'homework' : key === 'correction_records' ? 'corrections' : key}" style="--card-bg:${background};--card-color:${color}"><span class="overview-icon">${icon(iconName)}</span><span><strong>${counts[key]}</strong><small>${label}</small></span>${icon('arrow')}</button>`).join('')}</div><div class="dashboard-lower"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">权限身份</p><h3>当前账号</h3></div><span class="role-badge">${roleLabel[appContext.role]}</span></div><div class="account-line"><div class="large-avatar">${escapeHtml((appContext.profile.real_name || appContext.user.email || '慧')[0])}</div><div><strong>${escapeHtml(appContext.profile.real_name || '未设置姓名')}</strong><p>${escapeHtml(appContext.user.email || '')}</p></div></div><div class="info-line"><span>所属机构</span><strong>${escapeHtml(appContext.organization.name)}</strong></div><div class="info-line"><span>机构编码</span><strong>${escapeHtml(appContext.organization.code)}</strong></div></div><div class="panel panel-note"><div class="note-art">✦</div><div><p class="eyebrow">鸿慧教育</p><h3>从今天开始，<br/>让管理更从容。</h3><p>数据来自 Supabase 云端，电脑和手机都能看到同一套信息。</p></div></div></div>`
  target.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => { activeSection = button.dataset.section; render() }))
}

const attendanceStatusLabel = { present: '正常到校', late: '迟到', leave: '请假', absent: '缺勤' }
const todayInputValue = () => new Date().toISOString().slice(0, 10)

async function renderAttendancePage() {
  const target = document.querySelector('#section-content')
  target.innerHTML = '<div class="loading-state"><span class="loader"></span>正在读取考勤基础数据...</div>'
  const { data: campuses, error } = await supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).order('name')
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
    classes: { headers: ['班级名称', '年级', '所属校区', '学年', '状态', '操作'], cells: (row) => { const isAdmin = appContext.role === 'owner' || appContext.role === 'admin'; return [row.name, row.grade, row.campuses?.name || '—', row.school_year, statusBadge(row.status), `<div class="table-actions"><button class="secondary-button table-action" data-edit-class="${escapeHtml(row.id)}">编辑</button>${row.status === 'disabled' ? '' : `<button class="secondary-button table-action leave-action" data-disable-class="${escapeHtml(row.id)}">停用</button>`}${row.status === 'archived' ? '' : `<button class="secondary-button table-action" data-archive-class="${escapeHtml(row.id)}">归档</button>`}${isAdmin ? `<button class="secondary-button table-action" data-cleanup-class="${escapeHtml(row.id)}">清理历史学生关系</button><button class="secondary-button table-action leave-action" data-delete-class="${escapeHtml(row.id)}">删除</button>` : ''}</div>`] } },
    teachers: { headers: ['教师', '角色', '邮箱 / 联系方式', '加入时间', '状态'], cells: (row) => [row.profiles?.real_name || '未设置姓名', roleLabel[row.role] || row.role, row.profiles?.phone || '未填写', formatDate(row.joined_at), statusBadge(row.status)] },
    students: { headers: ['学生姓名', '学号', '年级', '所属校区', '当前班级', '就读学校', '状态', '操作'], cells: (row) => { const enrollment = getCurrentEnrollment(row); return [row.real_name, row.student_no || '—', row.grade, row.campuses?.name || '—', enrollment?.classes?.name || '未分配', row.school_name || '未填写', statusBadge(row.status), `<div class="table-actions"><button class="secondary-button table-action" data-edit-student="${escapeHtml(row.id)}">编辑</button><button class="secondary-button table-action leave-action" data-leave-student="${escapeHtml(row.id)}">离校</button></div>`] } },
    homework: { headers: ['学生姓名', '学号', '作业名称', '科目', '发布日期', '完成状态', '状态', '操作'], cells: (row) => { const isAdmin = appContext.role === 'owner' || appContext.role === 'admin'; return [row.students?.real_name || '—', row.students?.student_no || '—', row.title, row.subject || '综合', formatDate(row.homework_date), completionStatusBadge(row.student_homework_records?.[0]?.completion_status), statusBadge(row.status), `<div class="table-actions"><button class="secondary-button table-action" data-view-homework="${escapeHtml(row.id)}">查看</button>${isAdmin ? `<button class="secondary-button table-action leave-action" data-delete-homework="${escapeHtml(row.id)}">删除</button>` : ''}</div>`] } },
    corrections: { headers: ['批改状态', '评分', '评价', '批改老师', '批改时间'], cells: (row) => [statusBadge(row.correction_status), row.score ?? '—', row.rating || '未填写', row.profiles?.real_name || '未设置姓名', formatDate(row.corrected_at)] }
  }
  const table = config[activeSection]
  const toolbarAction = activeSection === 'students' ? '<button class="primary-button" data-add-student>新增学生</button>' : activeSection === 'classes' ? '<button class="primary-button" data-add-class>新增班级</button>' : activeSection === 'homework' ? '<button class="primary-button" data-add-homework>新增作业</button>' : `<span class="read-only-tag">云端数据 · 只读列表</span>`
  const searchBox = activeSection === 'students' ? '<input class="list-search" type="search" data-student-search placeholder="搜索姓名 / 学号" />' : ''
  const renderTable = (visibleRows) => {
    const tableRows = visibleRows.map((row) => `<tr ${activeSection === 'homework' ? `class="clickable-row" data-homework-id="${escapeHtml(row.id)}"` : activeSection === 'students' ? `class="clickable-row" data-student-id="${escapeHtml(row.id)}"` : ''}>${table.cells(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
    return `<div class="data-table-wrap">${visibleRows.length ? `<table class="data-table"><thead><tr>${table.headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>` : `<div class="empty-state"><span class="empty-symbol">${icon('book')}</span><h3>${rows.length ? '没有匹配的学生' : '还没有记录'}</h3><p>${rows.length ? '请尝试其他搜索关键词。' : `当前云端暂无${sections[activeSection].label}数据。`}</p></div>`}</div>`
  }
  target.innerHTML = `<div class="list-toolbar"><div><strong>${rows.length}</strong><span>条记录</span></div>${searchBox}${toolbarAction}</div>${renderTable(rows)}`
  target.querySelector('[data-add-student]')?.addEventListener('click', () => openStudentForm())
  target.querySelector('[data-add-class]')?.addEventListener('click', () => openClassForm())
  target.querySelector('[data-add-homework]')?.addEventListener('click', () => openHomeworkForm())
  const bindTableEvents = (visibleRows) => {
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
    target.querySelectorAll('[data-student-id]').forEach((row) => row.addEventListener('click', () => openStudentDetail(visibleRows.find((item) => item.id === row.dataset.studentId))))
  }
  bindTableEvents(rows)
  const searchInput = target.querySelector('[data-student-search]')
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const keyword = searchInput.value.trim().toLowerCase()
      const visibleRows = keyword
        ? rows.filter((row) => (row.real_name || '').toLowerCase().includes(keyword) || (row.student_no || '').toLowerCase().includes(keyword))
        : rows
      const tableWrap = target.querySelector('.data-table-wrap')
      tableWrap.outerHTML = renderTable(visibleRows)
      bindTableEvents(visibleRows)
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
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">学生档案</p><h2>${escapeHtml(student.real_name)}</h2><p class="muted">${escapeHtml(student.student_no || '未设置学号')} · ${escapeHtml(enrollment?.classes?.name || '未分配班级')}</p></div><button class="icon-button" type="button" title="关闭" data-close-student-detail>×</button></div><section class="detail-section"><div class="detail-section-heading"><p class="eyebrow">基础信息</p><h3>学生资料</h3></div><div class="detail-info-grid"><div><span>姓名</span><strong>${escapeHtml(student.real_name)}</strong></div><div><span>学号</span><strong>${escapeHtml(student.student_no || '—')}</strong></div><div><span>性别</span><strong>${student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : '未设置'}</strong></div><div><span>年级</span><strong>${escapeHtml(student.grade)}</strong></div><div><span>学校</span><strong>${escapeHtml(student.school_name || '未填写')}</strong></div><div><span>校区</span><strong>${escapeHtml(student.campuses?.name || '—')}</strong></div><div><span>当前班级</span><strong>${escapeHtml(enrollment?.classes?.name || '未分配')}</strong></div><div><span>状态</span><strong>${student.status === 'active' ? '在读' : escapeHtml(student.status || '—')}</strong></div></div></section><section class="detail-section"><div class="detail-section-heading"><p class="eyebrow">学习记录</p><h3>作业完成情况</h3></div><div class="detail-stats"><div><strong>${homeworkRecords.length}</strong><span>历史作业</span></div><div><strong>${completedCount}</strong><span>已完成</span></div><div><strong>${completionRate}</strong><span>完成率</span></div></div>${homeworkRecords.length ? `<div class="detail-list">${homeworkRecords.slice(0, 8).map((record) => `<div class="detail-list-row"><div><strong>${escapeHtml(record.homework_assignments?.title || '未命名作业')}</strong><small>${escapeHtml(record.homework_assignments?.classes?.name || '')} · ${formatDate(record.homework_assignments?.homework_date)}</small></div>${statusBadge(record.completion_status)}</div>`).join('')}</div>` : '<div class="detail-empty">暂无作业完成记录</div>'}</section><section class="detail-section"><div class="detail-section-heading"><p class="eyebrow">班级变化记录</p><h3>转班历史</h3></div>${enrollments.length ? `<div class="detail-list">${enrollments.map((item) => `<div class="detail-list-row"><div><strong>${escapeHtml(item.classes?.name || '未设置班级')}</strong><small>${formatDate(item.start_date)} 至 ${item.end_date ? formatDate(item.end_date) : '至今'}</small></div><span class="status-badge ${item.is_current ? 'active' : 'archived'}"><i></i>${item.is_current ? '当前班级' : '历史班级'}</span></div>`).join('')}</div>` : '<div class="detail-empty">暂无班级变化记录</div>'}</section>`
  modal.querySelector('[data-close-student-detail]').addEventListener('click', () => modal.remove())
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
  const { data: campuses, error } = await supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).order('name')
  logSupabaseResult('classes.form.campuses', campuses, error)
  if (error) {
    modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>${isEditing ? '编辑班级' : '新增班级'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-modal>×</button></div><div class="error-state"><strong>无法读取校区</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
    modal.querySelector('[data-close-class-modal]').addEventListener('click', () => modal.remove())
    return
  }
  const value = (field) => escapeHtml(classRecord?.[field] || '')
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">教学组织</p><h2>${isEditing ? '编辑班级' : '新增班级'}</h2></div><button class="icon-button" type="button" title="关闭" data-close-class-modal>×</button></div><form data-class-form><div class="form-grid"><label>校区 <span>*</span><select name="campus_id" required ${isEditing ? 'disabled' : ''}><option value="">请选择校区</option>${(campuses || []).map((campus) => `<option value="${escapeHtml(campus.id)}" ${classRecord?.campus_id === campus.id ? 'selected' : ''}>${escapeHtml(campus.name)}</option>`).join('')}</select></label><label>班级名称 <span>*</span><input name="name" required maxlength="100" value="${value('name')}" /></label><label>年级 <span>*</span><input name="grade" required maxlength="50" value="${value('grade')}" /></label><label>学年 <span>*</span><input name="school_year" required maxlength="20" value="${value('school_year')}" /></label>${isEditing ? `<label>状态<select name="status"><option value="active" ${classRecord?.status === 'active' ? 'selected' : ''}>正常</option><option value="disabled" ${classRecord?.status === 'disabled' ? 'selected' : ''}>已停用</option></select></label>` : ''}</div><div class="form-error" data-class-form-error></div><div class="modal-actions"><button class="secondary-button" type="button" data-close-class-modal>取消</button><button class="primary-button" type="submit">保存班级</button></div></form>`
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
    ? supabase.from('classes').update({ ...payload, status: form.get('status') }).eq('id', classId).eq('organization_id', appContext.organization.id)
    : supabase.from('classes').insert({ ...payload, campus_id: form.get('campus_id'), organization_id: appContext.organization.id, status: 'active' })
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

async function deleteClass(classId) {
  if (!window.confirm('确定删除该班级吗？删除后不可恢复')) return
  // 删除前检查是否存在历史业务数据（这些表外键为 on delete restrict，有数据则无法删除）
  // 先取该班级的作业 id、在读学生 id，用于检查间接关联表（student_homework_records / correction_records / student_fee_records）
  const [{ data: classHomeworks }, { data: enrolledStudents }] = await Promise.all([
    supabase.from('homework_assignments').select('id').eq('class_id', classId),
    supabase.from('student_class_enrollments').select('student_id').eq('class_id', classId)
  ])
  const homeworkIds = (classHomeworks || []).map((item) => item.id)
  const studentIds = (enrolledStudents || []).map((item) => item.student_id)
  // 取该班级作业对应的完成记录 id（用于检查批改记录）
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
  logSupabaseResult('classes.delete.check.enrollments', enrollmentResult, enrollmentResult.error)
  logSupabaseResult('classes.delete.check.homework', homeworkResult, homeworkResult.error)
  logSupabaseResult('classes.delete.check.homework_records', shrResult, shrResult.error)
  logSupabaseResult('classes.delete.check.corrections', correctionResult, correctionResult.error)
  logSupabaseResult('classes.delete.check.attendance', attendanceResult, attendanceResult.error)
  logSupabaseResult('classes.delete.check.fee', feeResult, feeResult.error)
  const checkError = enrollmentResult.error || homeworkResult.error || shrResult.error || correctionResult.error || attendanceResult.error || feeResult.error
  if (checkError) {
    showToast(checkError.message || '检查班级记录失败，请稍后重试。', 'error')
    return
  }
  const hasRecords = (enrollmentResult.count || 0) > 0 || (homeworkResult.count || 0) > 0 || (shrResult.count || 0) > 0 || (correctionResult.count || 0) > 0 || (attendanceResult.count || 0) > 0 || (feeResult.count || 0) > 0
  if (hasRecords) {
    showToast('该班级存在历史业务数据，只能停用或归档。', 'error')
    return
  }
  const { data, error } = await supabase.from('classes').delete().eq('id', classId).eq('organization_id', appContext.organization.id)
  logSupabaseResult('classes.delete', data, error)
  if (error) {
    showToast(error.message || '删除失败，请稍后重试。', 'error')
    return
  }
  showToast('班级删除成功')
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
    errorTarget.textContent = '该学生所在班级已停用或归档，不能发布作业。'
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
  renderHomeworkDetail(modal, homework, records || [])
}

function renderHomeworkDetailError(modal, error) {
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">作业详情</p><h2>无法读取完成情况</h2></div><button class="icon-button" type="button" title="关闭" data-close-homework-detail>×</button></div><div class="error-state"><strong>操作失败</strong><p>${escapeHtml(error.message || '请稍后重试。')}</p></div>`
  modal.querySelector('[data-close-homework-detail]').addEventListener('click', () => modal.remove())
}

function renderHomeworkDetail(modal, homework, records) {
  const currentRecord = records[0] || null
  modal.querySelector('.modal').innerHTML = `<div class="modal-heading"><div><p class="eyebrow">作业详情</p><h2>${escapeHtml(homework.title)}</h2><p class="muted">${escapeHtml(homework.students?.real_name || '未设置学生')} · ${escapeHtml(homework.subject || '综合')} · ${formatDate(homework.homework_date)}</p></div><button class="icon-button" type="button" title="关闭" data-close-homework-detail>×</button></div><div class="homework-stats"><div><strong>${records.length}</strong><span>完成记录</span></div><div><strong>${currentRecord ? completionStatusLabel[currentRecord.completion_status] || currentRecord.completion_status : '—'}</strong><span>当前状态</span></div></div><div class="homework-record-list">${records.length ? records.map((record) => `<div class="homework-record-row" data-record-id="${escapeHtml(record.id)}"><div><strong>${escapeHtml(homework.students?.real_name || '未设置姓名')}</strong><small>${escapeHtml(homework.students?.student_no || '')}</small></div><select data-completion-status><option value="not_started" ${record.completion_status === 'not_started' ? 'selected' : ''}>未开始</option><option value="partial" ${record.completion_status === 'partial' ? 'selected' : ''}>完成中</option><option value="completed" ${record.completion_status === 'completed' ? 'selected' : ''}>已完成</option><option value="late" ${record.completion_status === 'late' ? 'selected' : ''}>已完成（逾期）</option></select><span class="completion-time">${record.completed_at ? formatDate(record.completed_at) : '—'}</span><input data-record-note placeholder="备注" value="${escapeHtml(record.note || '')}" /><button class="secondary-button table-action" data-save-record>保存</button></div>`).join('') : '<div class="empty-state"><h3>暂无完成记录</h3></div>'}</div>`
  modal.querySelector('[data-close-homework-detail]').addEventListener('click', () => modal.remove())
  modal.querySelectorAll('[data-save-record]').forEach((button) => button.addEventListener('click', () => saveHomeworkRecord(button.closest('[data-record-id]'))))
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

  const { data: campuses, error } = await supabase.from('campuses').select('id, name').eq('organization_id', appContext.organization.id).order('name')
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

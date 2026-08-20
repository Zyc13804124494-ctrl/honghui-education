import './style.css'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'

const sections = {
  home: { label: '首页', eyebrow: '管理总览', title: '鸿慧教育管理后台', description: '掌握两个校区的教学运营状态。' },
  campuses: { label: '校区管理', eyebrow: '组织架构', title: '校区管理', description: '查看鸿慧教育的校区信息。' },
  classes: { label: '班级管理', eyebrow: '教学组织', title: '班级管理', description: '查看各校区的班级安排。' },
  teachers: { label: '教师管理', eyebrow: '团队成员', title: '教师管理', description: '查看机构内的教师与授权范围。' },
  students: { label: '学生管理', eyebrow: '学生档案', title: '学生管理', description: '查看当前机构的学生档案。' },
  homework: { label: '作业管理', eyebrow: '学习进度', title: '作业管理', description: '查看班级作业发布情况。' },
  corrections: { label: '批改记录', eyebrow: '教学反馈', title: '批改记录', description: '查看老师的作业批改记录。' }
}

const navigation = [
  ['home', '⌂'], ['campuses', '⌑'], ['classes', '▦'], ['teachers', '♧'],
  ['students', '♙'], ['homework', '✓'], ['corrections', '✎']
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
    const queries = {
      campuses: ['campuses', 'id, name, code, address, contact_phone, status, created_at', 'created_at'],
      classes: ['classes', 'id, name, grade, school_year, status, campus_id, campuses(name)', 'created_at'],
      teachers: ['organization_members', 'user_id, role, status, joined_at, profiles(real_name, phone)', 'joined_at'],
      students: ['students', 'id, student_no, real_name, grade, school_name, status, campus_id, campuses(name)', 'created_at'],
      homework: ['homework_assignments', 'id, title, subject, homework_date, due_date, status, class_id, classes(name)', 'homework_date'],
      corrections: ['correction_records', 'id, correction_status, score, rating, corrected_at, reviewer_id, profiles(real_name)', 'corrected_at']
    }
    const [table, columns, order] = queries[activeSection]
    const builder = supabase.from(table).select(columns)
    if (table === 'organization_members') builder.eq('organization_id', appContext.organization.id)
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
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
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

function renderList(rows) {
  const target = document.querySelector('#section-content')
  const config = {
    campuses: { headers: ['校区名称', '编码', '地址', '联系电话', '状态'], cells: (row) => [row.name, row.code, row.address || '未填写', row.contact_phone || '未填写', statusBadge(row.status)] },
    classes: { headers: ['班级名称', '年级', '所属校区', '学年', '状态'], cells: (row) => [row.name, row.grade, row.campuses?.name || '—', row.school_year, statusBadge(row.status)] },
    teachers: { headers: ['教师', '角色', '邮箱 / 联系方式', '加入时间', '状态'], cells: (row) => [row.profiles?.real_name || '未设置姓名', roleLabel[row.role] || row.role, row.profiles?.phone || '未填写', formatDate(row.joined_at), statusBadge(row.status)] },
    students: { headers: ['学生姓名', '学号', '年级', '所属校区', '就读学校', '状态'], cells: (row) => [row.real_name, row.student_no || '—', row.grade, row.campuses?.name || '—', row.school_name || '未填写', statusBadge(row.status)] },
    homework: { headers: ['作业标题', '科目', '班级', '作业日期', '截止日期', '状态'], cells: (row) => [row.title, row.subject || '综合', row.classes?.name || '—', formatDate(row.homework_date), formatDate(row.due_date), statusBadge(row.status)] },
    corrections: { headers: ['批改状态', '评分', '评价', '批改老师', '批改时间'], cells: (row) => [statusBadge(row.correction_status), row.score ?? '—', row.rating || '未填写', row.profiles?.real_name || '未设置姓名', formatDate(row.corrected_at)] }
  }
  const table = config[activeSection]
  target.innerHTML = `<div class="list-toolbar"><div><strong>${rows.length}</strong><span>条记录</span></div><span class="read-only-tag">云端数据 · 只读列表</span></div><div class="data-table-wrap">${rows.length ? `<table class="data-table"><thead><tr>${table.headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${table.cells(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="empty-state"><span class="empty-symbol">${icon('book')}</span><h3>还没有记录</h3><p>当前云端暂无${sections[activeSection].label}数据。</p></div>`}</div>`
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

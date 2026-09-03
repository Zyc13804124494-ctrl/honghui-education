// 鸿慧教育 Service Worker
// 策略：
//   - 导航请求：网络优先，失败回退缓存（保证离线也能打开应用）
//   - 静态资源：stale-while-revalidate（离线用缓存，联网后后台自动更新缓存）
//   - 跨域请求（如 Supabase API / Edge Functions）：不拦截，保证数据实时

const CACHE_NAME = 'honghui-edu-v2'
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 只处理同源 GET 请求；跨域（Supabase）与其它方法一律放行
  if (url.origin !== self.location.origin) return
  if (request.method !== 'GET') return

  // 导航（打开页面）：网络优先，失败回退缓存的 index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    )
    return
  }

  // 静态资源：stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})

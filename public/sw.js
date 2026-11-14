/* SMS 移动端 Service Worker：静态资源缓存优先，导航请求失败时回退离线提示。 */
const CACHE = 'sms-static-v1'
const PRECACHE = ['/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 导航请求：网络优先，离线时返回轻量提示页。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>离线</title>' +
        '<body style="font-family:system-ui;padding:32px;text-align:center;color:#0f172a">' +
        '<h1 style="font-size:18px">当前网络不可用</h1>' +
        '<p style="font-size:13px;color:#64748b">请恢复网络后重试，已缓存的页面仍可访问。</p></body>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } }
      ))
    )
    return
  }

  // 静态资源：缓存优先，后台更新。
  if (url.pathname.startsWith('/_nuxt/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) void caches.open(CACHE).then(cache => cache.put(request, response.clone()))
          return response
        })
        return cached ?? network
      })
    )
  }
})

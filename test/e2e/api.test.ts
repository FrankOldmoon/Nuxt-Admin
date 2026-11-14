import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nuxt_ai'

/** Toggle the `security.captchaEnabled` config in the shared test database. */
async function setCaptchaEnabled(value: string): Promise<void> {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()
  try {
    await client.query(`UPDATE configs SET value = $1 WHERE key = 'security.captchaEnabled'`, [value])
  } finally {
    await client.end()
  }
}

// The login handler validates CAPTCHA when `security.captchaEnabled` is true (the default),
// but an integration test cannot solve the randomized SVG. Disable it before the test server
// boots (so its config cache loads the disabled value) and restore it afterwards.
await setCaptchaEnabled('false')

/** The shared test DB may predate recent schema migrations; bootstrap file columns. */
async function ensureFileColumns(): Promise<void> {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()
  try {
    await client.query(`ALTER TABLE files ADD COLUMN IF NOT EXISTS visibility varchar(10) DEFAULT 'public' NOT NULL`)
    await client.query(`ALTER TABLE files ALTER COLUMN visibility SET DEFAULT 'private'`)
    await client.query(`ALTER TABLE files ADD COLUMN IF NOT EXISTS organization_id integer`)
    await client.query(`ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id integer`)
  } finally {
    await client.end()
  }
}
await ensureFileColumns()

describe('API integration tests (reusing the nuxt_ai database)', async () => {
  await setup({ server: { port: 3001 } })

  afterAll(() => setCaptchaEnabled('true'))

  /** Log in as the seed admin and return the session cookie.
   *  Memoized because the login endpoint rate-limits (5 attempts / 15 min). */
  let adminCookie: string | null = null
  async function loginAsAdmin(): Promise<string> {
    if (adminCookie) return adminCookie
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@example.com', password: 'Admin@123' })
    })
    const setCookie = res.headers.get('set-cookie') || ''
    adminCookie = setCookie.split(';')[0]
    return adminCookie
  }

  it('GET / is reachable', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('GET /api/config/public returns the site config', async () => {
    const data = await $fetch<{ configs: Record<string, string> }>('/api/config/public')
    expect(data.configs).toBeTypeOf('object')
    expect(data.configs['site.title']).toBeTruthy()
  })

  it('POST /api/auth/login logs in as the seed admin', async () => {
    const res = await $fetch<{ user: { username: string, role: { name: string } } }>('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@example.com', password: 'Admin@123' }
    })
    expect(res.user.username).toBe('admin')
    expect(res.user.role.name).toBe('admin')
  })

  it('POST /api/auth/login rejects a wrong password', async () => {
    await expect($fetch('/api/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@example.com', password: 'wrong-password' }
    })).rejects.toThrow()
  })

  it('GET /api/auth/me returns 401 when not logged in', async () => {
    await expect($fetch('/api/auth/me')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('with a session cookie, /api/auth/me is accessible after login', async () => {
    const cookie = await loginAsAdmin()
    expect(cookie).toContain('session')

    const me = await $fetch<{ user: { username: string } }>('/api/auth/me', {
      headers: { cookie }
    })
    expect(me.user.username).toBe('admin')
  })

  it('an admin session can access the /api/dashboard/data/users list', async () => {
    const cookie = await loginAsAdmin()

    const data = await $fetch<{ items: unknown[], pagination: { total: number } }>('/api/dashboard/data/users', {
      headers: { cookie }
    })
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.pagination.total).toBeGreaterThan(0)
  })

  it('an admin session gets the chat component catalog with resolved interactions', async () => {
    const cookie = await loginAsAdmin()

    const data = await $fetch<{
      components: Array<{ id: string, label: string, interactions: { detail: boolean, edit: boolean } }>
    }>('/api/agent/components', { headers: { cookie } })

    expect(Array.isArray(data.components)).toBe(true)
    for (const component of data.components) {
      expect(component.id, component.id).toBeTruthy()
      expect(component.label, component.id).toBeTruthy()
      expect(typeof component.interactions.edit, component.id).toBe('boolean')
    }
    // Admin holds '*', so every registered edit interaction is enabled.
    for (const component of data.components) {
      if (component.interactions.detail) {
        expect(component.interactions.edit, component.id).toBe(true)
      }
    }
  })

  it('GET /api/dashboard/data/users is blocked without login', async () => {
    await expect($fetch('/api/dashboard/data/users')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('does not expose internal or auto-discovered tables through generic CRUD', async () => {
    const cookie = await loginAsAdmin()
    for (const table of ['tokens', 'audit_logs', 'organizations', 'organization_memberships', 'private_messages', 'notificationReads']) {
      await expect($fetch(`/api/dashboard/data/${table}`, { headers: { cookie } }))
        .rejects.toMatchObject({ statusCode: 404 })
    }
  })

  it('enforces file visibility, private authorization and path safety', async () => {
    const cookie = await loginAsAdmin()
    const me = await fetch('/api/auth/me', { headers: { cookie } })
    expect(me.status).toBe(200)
    const upload = async (visibility?: 'public' | 'private') => {
      const form = new FormData()
      const marker = `secret-${Date.now()}-${Math.random().toString(36).slice(2)}`
      form.append('files', new Blob([marker], { type: 'text/plain' }), 'note.txt')
      if (visibility) form.append('visibility', visibility)
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: form,
        headers: { cookie }
      })
      const json = await res.json() as { files: Array<{ path: string }> }
      expect(res.status, JSON.stringify(json)).toBe(200)
      return { path: json.files[0]!.path, marker }
    }
    const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

    const priv = await upload()
    await expect($fetch(`/api/files/serve/${encodePath(priv.path)}`))
      .rejects.toMatchObject({ statusCode: 401 })
    const authed = await $fetch<string>(`/api/files/serve/${encodePath(priv.path)}`, { headers: { cookie } })
    expect(authed).toContain(priv.marker)

    const pub = await upload('public')
    const anonymous = await $fetch<string>(`/api/files/serve/${encodePath(pub.path)}`)
    expect(anonymous).toContain(pub.marker)

    await expect($fetch(`/api/files/serve/${encodeURIComponent('../../etc/passwd')}`))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('GET /api/dashboard/modules requires admin and lists the module catalog', async () => {
    await expect($fetch('/api/dashboard/modules')).rejects.toMatchObject({ statusCode: 401 })

    const cookie = await loginAsAdmin()
    const data = await $fetch<{
      validation: { ok: boolean, error: string | null }
      modules: Array<{ id: string, state: { state: string } | null }>
    }>('/api/dashboard/modules', { headers: { cookie } })

    expect(data.validation.ok).toBe(true)
    expect(data.modules.map(module => module.id)).toEqual(expect.arrayContaining(['example']))
    for (const module of data.modules) {
      expect(['active', 'deactivated']).toContain(module.state?.state)
    }
  })

  it('rejects generic import/export for custom tables', async () => {
    const cookie = await loginAsAdmin()
    await expect($fetch('/api/dashboard/data/configs/export', { headers: { cookie } }))
      .rejects.toMatchObject({ statusCode: 405 })
    await expect($fetch('/api/dashboard/data/configs/import', {
      method: 'POST',
      headers: { cookie },
      body: { rows: [['key', 'value']] }
    })).rejects.toMatchObject({ statusCode: 405 })
  })

  it('GET /api/health reports database and realtime status', async () => {
    const health = await $fetch<{
      status: string
      checks: { database: string }
      realtime: { driver: string }
    }>('/api/health')
    expect(health.status).toBe('ok')
    expect(health.checks.database).toBe('ok')
    expect(['memory', 'postgres']).toContain(health.realtime.driver)
  })

  it('POST /api/auth/register follows the allowRegistration config', async () => {
    const pub = await $fetch<{ configs: Record<string, string> }>('/api/config/public')
    const allowed = pub.configs['site.allowRegistration'] === 'true'
    const email = `itest${Date.now()}@example.com`
    const action = () => $fetch<{ user: { username: string } }>('/api/auth/register', {
      method: 'POST',
      body: { username: `itest${Date.now()}`, email, password: 'Password1' }
    })
    if (allowed) {
      const res = await action()
      expect(res.user.username).toBeTruthy()
    } else {
      await expect(action()).rejects.toMatchObject({ statusCode: 403 })
    }
  })
})

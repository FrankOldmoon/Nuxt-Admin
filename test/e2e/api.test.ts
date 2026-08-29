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

describe('API integration tests (reusing the nuxt_ai database)', async () => {
  await setup({ server: { port: 3001 } })

  afterAll(() => setCaptchaEnabled('true'))

  /** Log in as the seed admin and return the session cookie */
  async function loginAsAdmin(): Promise<string> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@example.com', password: 'Admin@123' })
    })
    const setCookie = res.headers.get('set-cookie') || ''
    return setCookie.split(';')[0]
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

  it('GET /api/dashboard/data/users is blocked without login', async () => {
    await expect($fetch('/api/dashboard/data/users')).rejects.toMatchObject({ statusCode: 401 })
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
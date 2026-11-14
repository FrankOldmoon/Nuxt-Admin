import { expect, test, type BrowserContext } from '@playwright/test'

/**
 * Role-chain e2e for the SMS module.
 *
 * Demo accounts are seeded by the app itself when it starts with
 * `SEED_SMS_DEMO_USERS=true` (see modules/sms/server/demoUsers.ts):
 *
 *   E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD
 *   E2E_GUARDIAN_EMAIL / E2E_GUARDIAN_PASSWORD
 *   E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD
 *
 * The test only skips when seeding was not enabled; once enabled, a failed
 * login fails the test instead of being silently ignored.
 */
const seeded = process.env.SEED_SMS_DEMO_USERS === 'true'
const skipReason = 'SMS demo users are not seeded (start the app with SEED_SMS_DEMO_USERS=true)'

async function login(context: BrowserContext, email: string, password: string) {
  return await context.request.post('/api/auth/login', { data: { identifier: email, password } })
}

async function loginDemo(
  context: BrowserContext,
  envPrefix: string,
  fallbackEmail: string,
  fallbackPassword: string
) {
  const response = await login(
    context,
    process.env[`${envPrefix}_EMAIL`] ?? fallbackEmail,
    process.env[`${envPrefix}_PASSWORD`] ?? fallbackPassword
  )
  expect(response.ok(), `SMS demo account ${fallbackEmail} failed to sign in`).toBe(true)
  return response
}

test.describe('SMS role chains', () => {
  test.skip(!seeded, skipReason)

  test('teacher reads students and cannot publish scores', async ({ context }) => {
    await loginDemo(context, 'E2E_TEACHER', 'teacher@example.com', 'Teacher@123')

    const students = await context.request.get('/api/modules/sms/students')
    expect(students.status()).toBe(200)

    const publish = await context.request.post('/api/modules/sms/scores/publish', {
      data: { examId: 1 }
    })
    expect(publish.status()).toBe(403)
  })

  test('guardian sees invoices but cannot create fee items', async ({ context }) => {
    await loginDemo(context, 'E2E_GUARDIAN', 'guardian@example.com', 'Guardian@123')

    const invoices = await context.request.get('/api/modules/sms/invoices')
    expect(invoices.status()).toBe(200)

    const fees = await context.request.post('/api/modules/sms/fees', {
      data: { name: 'E2E fee', amount: 10 }
    })
    expect(fees.status()).toBe(403)
  })

  test('finance lists refunds and cannot publish scores', async ({ context }) => {
    await loginDemo(context, 'E2E_FINANCE', 'finance@example.com', 'Finance@123')

    const refunds = await context.request.get('/api/modules/sms/refunds')
    expect(refunds.status()).toBe(200)

    const publish = await context.request.post('/api/modules/sms/scores/publish', {
      data: { examId: 1 }
    })
    expect(publish.status()).toBe(403)
  })
})

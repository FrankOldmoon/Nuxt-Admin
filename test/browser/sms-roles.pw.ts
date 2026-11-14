import { expect, test, type BrowserContext } from '@playwright/test'

/**
 * Role-chain e2e for the SMS module (P0).
 *
 * Each test logs in through the real API, then exercises the module endpoints
 * the role should (and should not) reach. Credentials come from the environment
 * so CI can seed dedicated demo users:
 *
 *   E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD
 *   E2E_GUARDIAN_EMAIL / E2E_GUARDIAN_PASSWORD
 *   E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD
 *
 * When an account is missing the test skips instead of failing the suite.
 */
async function login(context: BrowserContext, email: string, password: string) {
  return await context.request.post('/api/auth/login', { data: { identifier: email, password } })
}

test.describe('SMS role chains', () => {
  test('teacher reads students and cannot publish scores', async ({ context }) => {
    const response = await login(
      context,
      process.env.E2E_TEACHER_EMAIL ?? 'teacher@example.com',
      process.env.E2E_TEACHER_PASSWORD ?? 'Teacher@123'
    )
    test.skip(!response.ok(), 'Teacher demo account is not seeded')

    const students = await context.request.get('/api/modules/sms/students')
    expect(students.status()).toBe(200)

    const publish = await context.request.post('/api/modules/sms/scores/publish', {
      data: { examId: 1 }
    })
    expect(publish.status()).toBe(403)
  })

  test('guardian sees invoices but cannot create fee items', async ({ context }) => {
    const response = await login(
      context,
      process.env.E2E_GUARDIAN_EMAIL ?? 'guardian@example.com',
      process.env.E2E_GUARDIAN_PASSWORD ?? 'Guardian@123'
    )
    test.skip(!response.ok(), 'Guardian demo account is not seeded')

    const invoices = await context.request.get('/api/modules/sms/invoices')
    expect(invoices.status()).toBe(200)

    const fees = await context.request.post('/api/modules/sms/fees', {
      data: { name: 'E2E fee', amount: 10 }
    })
    expect(fees.status()).toBe(403)
  })

  test('finance lists refunds and cannot publish scores', async ({ context }) => {
    const response = await login(
      context,
      process.env.E2E_FINANCE_EMAIL ?? 'finance@example.com',
      process.env.E2E_FINANCE_PASSWORD ?? 'Finance@123'
    )
    test.skip(!response.ok(), 'Finance demo account is not seeded')

    const refunds = await context.request.get('/api/modules/sms/refunds')
    expect(refunds.status()).toBe(200)

    const publish = await context.request.post('/api/modules/sms/scores/publish', {
      data: { examId: 1 }
    })
    expect(publish.status()).toBe(403)
  })
})

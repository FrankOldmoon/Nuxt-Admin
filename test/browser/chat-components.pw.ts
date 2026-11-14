import { expect, test } from '@playwright/test'

/**
 * Full chat component path: model reply → interactive table → detail dialog.
 * Editing is covered by the unit/permission tests and the manual browser run;
 * this spec keeps the critical read/interaction path in CI-friendly form.
 */
test.describe('SMS chat components', () => {
  test('renders the student table from a plain query and opens the detail dialog', async ({ page, context }) => {
    const session = process.env.E2E_SESSION_COOKIE
    if (session) {
      await context.addCookies([{
        name: 'session',
        value: session,
        url: process.env.E2E_BASE_URL || 'http://localhost:3000'
      }])
    } else {
      // `context.request` shares the cookie jar with the browser context, so
      // the session survives page.goto. CAPTCHA must be disabled.
      const login = await context.request.post('/api/auth/login', {
        data: { identifier: 'admin@example.com', password: 'Admin@123' }
      })
      test.skip(!login.ok(), 'Login failed (CAPTCHA enabled?) — set E2E_SESSION_COOKIE to reuse a session.')
    }

    await page.goto('/sms/chat')
    await page.waitForLoadState('networkidle')
    const newChat = page.getByRole('button', { name: /新建|新对话|New/ })
    if (await newChat.count()) {
      await newChat.first().click()
      await page.waitForLoadState('networkidle')
    }

    const composer = page.getByPlaceholder(/描述你要查询或办理的事情/)
    await composer.waitFor()
    await composer.fill('查询所有学生')
    await composer.press('Enter')
    await expect(page.getByText('查询所有学生').first()).toBeVisible()

    // A read query without a model component block still gets the default table.
    const table = page.locator('table').first()
    await expect(table.getByText('Alice Chen')).toBeVisible()

    // Toolbar from the interactive component, not the static result card.
    await expect(page.getByPlaceholder('搜索姓名或学号')).toBeVisible()
    await expect(page.getByLabel('排序字段')).toBeVisible()

    await table.getByRole('button', { name: 'Alice Chen' }).click()
    await expect(page.getByText('学生详情 · Alice Chen')).toBeVisible()
    await expect(page.getByRole('button', { name: '编辑' })).toBeVisible()
    // "用户 ID" only exists in the detail dialog for students.
    await expect(page.getByText('用户 ID', { exact: true })).toBeVisible()
  })
})

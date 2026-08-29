import { count, eq, inArray } from 'drizzle-orm'
import type { Database } from './index'
import {
  users as usersTable,
  roles as rolesTable,
  configs as configsTable,
  templates as templatesTable
} from './schema'

const DEFAULT_CONFIGS = [
  { key: 'site.title', value: 'Nuxt Admin', type: 'string', description: 'Site title' },
  { key: 'site.description', value: 'A production-grade, metadata-driven admin framework built with Nuxt 4.', type: 'string', description: 'Site description' },
  { key: 'site.allowRegistration', value: 'true', type: 'boolean', description: 'Allow public registration' },
  { key: 'mail.from', value: 'no-reply@example.com', type: 'string', description: 'From address for outgoing mail' },
  { key: 'mail.host', value: '', type: 'string', description: 'SMTP host' },
  { key: 'mail.port', value: '587', type: 'number', description: 'SMTP port' },
  { key: 'mail.secure', value: 'false', type: 'boolean', description: 'Use SSL/TLS (true for 465, false for 587)' },
  { key: 'mail.user', value: '', type: 'string', description: 'SMTP username' },
  { key: 'mail.pass', value: '', type: 'string', description: 'SMTP password' },
  { key: 'security.passwordResetTtlMinutes', value: '30', type: 'number', description: 'Password reset token TTL (minutes)' },
  { key: 'security.emailVerificationTtlMinutes', value: '1440', type: 'number', description: 'Email verification token TTL (minutes)' },
  { key: 'security.sessionTtlDays', value: '7', type: 'number', description: 'Session token TTL (days)' },
  { key: 'security.captchaEnabled', value: 'true', type: 'boolean', description: 'Enable graphic captcha on the login page' },
  { key: 'security.captchaSecret', value: '', type: 'string', description: 'CAPTCHA HMAC signing secret (leave blank to use env NUXT_CAPTCHA_SECRET or the dev default)' },
  { key: 'security.loginMaxAttempts', value: '5', type: 'number', description: 'Number of consecutive failed logins before the account is locked' },
  { key: 'security.loginLockMinutes', value: '15', type: 'number', description: 'Account lock duration (minutes)' },
  // ---- Third-party / SSO (OAuth2) configs ----
  { key: 'oauth.github.enabled', value: 'false', type: 'boolean', description: 'Enable "Sign in with GitHub" (OAuth2). Requires clientId/clientSecret below.' },
  { key: 'oauth.github.clientId', value: '', type: 'string', description: 'GitHub OAuth App Client ID' },
  { key: 'oauth.github.clientSecret', value: '', type: 'string', description: 'GitHub OAuth App Client Secret' },
  { key: 'oauth.provision', value: 'true', type: 'boolean', description: 'Auto-create a local account on first SSO sign-in when no account is linked yet' },
  { key: 'oauth.defaultRoleName', value: 'user', type: 'string', description: 'Role assigned to SSO users created by auto-provisioning' },
  { key: 'oauth.callbackRedirect', value: '/', type: 'string', description: 'Frontend path to redirect to after a successful SSO sign-in (default "/")' },
  { key: 'upload.maxFileSize', value: '10', type: 'number', description: 'Max upload file size (MB)' },
  { key: 'upload.allowedMimeTypes', value: '', type: 'string', description: 'Allowed upload MIME types (comma-separated, empty = all)' },
  {
    key: 'dashboard.menu',
    value: JSON.stringify([
      { table: 'roles', label: 'Roles', icon: 'i-lucide-shield', order: 10 },
      { table: 'users', label: 'Users', icon: 'i-lucide-users', order: 20 },
      { table: 'templates', label: 'Templates', icon: 'i-lucide-file-text', order: 25 },
      { table: 'files', label: 'Files', icon: 'i-lucide-folder-open', order: 30 },
      { table: 'configs', label: 'Configs', icon: 'i-lucide-settings-2', order: 40 },
      { table: 'notifications', label: 'Notifications', icon: 'i-lucide-bell-ring', order: 50 }
    ]),
    type: 'json',
    description: 'Dashboard left-side menu configuration (JSON array, each item contains table/label/icon/order/hidden)'
  },
  // ---- LLM (OpenAI-compatible) configs ----
  { key: 'llm.apiKey', value: '', type: 'string', description: 'API key for the OpenAI-compatible API' },
  { key: 'llm.baseUrl', value: 'https://api.openai.com/v1', type: 'string', description: 'Base URL for the OpenAI-compatible API' },
  { key: 'llm.model', value: 'gpt-4o-mini', type: 'string', description: 'Default chat model name' },
  { key: 'llm.temperature', value: '0.7', type: 'number', description: 'Default temperature parameter (0-2)' },
  { key: 'llm.maxTokens', value: '2048', type: 'number', description: 'Default maximum number of generated tokens' },
  { key: 'llm.systemPrompt', value: 'You are a helpful assistant.', type: 'string', description: 'Default system prompt' }
]

export async function seed(db: Database): Promise<void> {
  // 0. Configs (always upsert missing keys, preserve existing values)
  await db.insert(configsTable)
    .values(DEFAULT_CONFIGS)
    .onConflictDoNothing({ target: configsTable.key })

  // 0b. Purge legacy auth tokens previously stored in the configs table.
  // Password-reset and email-verification tokens now live in the tokens table.
  await db.delete(configsTable).where(inArray(configsTable.type, ['password_reset', 'email_verify']))

  // 0b2. Merge default menu items newly added in newer versions into the existing
  // dashboard.menu config (idempotent; preserves admin-customized label/icon/order/hidden,
  // only appends missing entries).
  await mergeMenuConfig(db)

  // 0c. Showcase `templates` table (personalization-ladder walkthrough).
  // Idempotent: only seeds when the table is empty so admin edits are preserved.
  const [templateCount] = await db.select({ value: count() }).from(templatesTable)
  if (Number(templateCount?.value ?? 0) === 0) {
    await db.insert(templatesTable).values([
      {
        name: 'Invoice Layout', sku: 'TPL-INV-01', price: 59.99, stock: 42,
        status: 'active', coverImage: '', docFile: [], tags: ['new', 'hot'],
        description: 'Clean invoice layout for B2B billing.',
        meta: { color: 'blue', layout: 'A4', weight: '0.2MB' },
        markdown: '# Invoice Layout\n\n- **Pages:** 1\n- **Format:** PDF + DOCX\n\n> Customize the header, footer and tax block.',
        releasedAt: new Date('2026-06-01T00:00:00.000Z')
      },
      {
        name: 'Resume Template', sku: 'TPL-RSM-02', price: 39.5, stock: 8,
        status: 'active', coverImage: '', docFile: [], tags: ['featured'],
        description: 'One-page modern resume template.',
        meta: { color: 'white', pages: '1' },
        markdown: '## Resume Template\n\nATS-friendly sections with a clean timeline.\n\n| Spec | Value |\n|------|-------|\n| Pages | 1 |\n| ATS | Yes |',
        releasedAt: new Date('2026-07-15T00:00:00.000Z')
      },
      {
        name: 'Email Newsletter', sku: 'TPL-EML-03', price: 329, stock: 0,
        status: 'draft', coverImage: '', docFile: [], tags: ['sale'],
        description: 'Responsive email newsletter template.',
        meta: { client: 'MJML', width: '600px' },
        markdown: '## Email Newsletter\n\n- 600px responsive\n- MJML source\n\n### Coming soon\n\nInclude drag-and-drop blocks.',
        releasedAt: new Date('2026-09-01T00:00:00.000Z')
      },
      {
        name: 'Product Card', sku: 'TPL-PRD-04', price: 89.99, stock: 15,
        status: 'active', coverImage: '', docFile: [], tags: ['new', 'sale', 'featured'],
        description: 'E-commerce product card template.',
        meta: { format: 'PNG', ratio: '1:1' },
        markdown: '## Product Card\n\nEverything you need for e-commerce:\n\n1. Price & discount badge\n2. Star rating\n3. Add-to-cart',
        releasedAt: new Date('2026-08-10T00:00:00.000Z')
      },
      {
        name: 'Landing Hero', sku: 'TPL-LND-05', price: 12.5, stock: 4,
        status: 'archived', coverImage: '', docFile: [], tags: ['refurbished'],
        description: 'Landing page hero section template.',
        meta: { format: 'Figma' },
        markdown: '> Discontinued — limited refurbished stock only.',
        releasedAt: new Date('2025-11-20T00:00:00.000Z')
      }
    ])
    console.log('[database] Seeded templates showcase data (5 rows)')
  }

  // Idempotency: if roles exist, skip roles/users seeding
  const [roleRow] = await db.select({ value: count() }).from(rolesTable)
  if (Number(roleRow?.value ?? 0) > 0) {
    console.log('[database] Seed skipped (roles already exist)')
    return
  }

  // 1. Roles
  const [adminRole] = await db.insert(rolesTable).values([
    { name: 'admin', description: 'System administrator', permissions: ['*'] }
  ]).returning()
  const [userRole] = await db.insert(rolesTable).values([
    { name: 'user', description: 'Standard user', permissions: [] }
  ]).returning()
  if (!adminRole || !userRole) {
    throw new Error('Failed to seed roles')
  }

  // 2. Users
  const records = [
    {
      username: 'admin',
      name: 'Administrator',
      email: 'admin@example.com',
      telephone: '13800000000',
      passwordHash: hashPassword('Admin@123'),
      isActive: true,
      roleId: adminRole.id,
      emailVerifiedAt: new Date()
    }
  ]
  for (let i = 1; i <= 30; i++) {
    const num = String(i).padStart(2, '0')
    records.push({
      username: `test${num}`,
      name: `Test User ${num}`,
      email: `test${num}@example.com`,
      telephone: '13900000000',
      passwordHash: hashPassword('Test@123'),
      isActive: true,
      roleId: userRole.id,
      emailVerifiedAt: new Date()
    })
  }
  await db.insert(usersTable).values(records)

  console.log(`[database] Seeded: 2 roles, ${records.length} users, ${DEFAULT_CONFIGS.length} configs`)
}

/** Default menu items from newer versions (merged into any existing dashboard.menu config). */
const NEW_DEFAULT_MENU_ENTRIES: Array<{ table: string; label: string; icon: string; order: number }> = [
  { table: 'templates', label: 'Templates', icon: 'i-lucide-file-text', order: 25 }
]

/**
 * Idempotently merge the menu: preserves admin-customized entries in any existing
 * dashboard.menu config and only appends entries from NEW_DEFAULT_MENU_ENTRIES
 * whose table is missing.
 */
async function mergeMenuConfig(db: Database): Promise<void> {
  const [cfg] = await db
    .select({ id: configsTable.id, value: configsTable.value })
    .from(configsTable)
    .where(eq(configsTable.key, 'dashboard.menu'))
    .limit(1)
  if (!cfg) return // No saved menu config → the DEFAULT_MENU fallback is sufficient

  let parsed: Array<Record<string, unknown>> = []
  try {
    const v = JSON.parse(cfg.value)
    if (Array.isArray(v)) parsed = v
  } catch {
    return // Corrupted config → do nothing
  }
  const existing = new Set(parsed.map(e => typeof e?.table === 'string' ? e.table : ''))
  let changed = false
  // Prune entries for tables that no longer exist (departments / audit_logs).
  const REMOVED_TABLES = new Set(['departments', 'audit_logs', 'products'])
  const before = parsed.length
  parsed = parsed.filter(e => !(typeof e?.table === 'string' && REMOVED_TABLES.has(e.table)))
  if (parsed.length !== before) changed = true
  for (const entry of NEW_DEFAULT_MENU_ENTRIES) {
    if (!existing.has(entry.table)) {
      parsed.push(entry)
      changed = true
    }
  }
  if (changed) {
    await db.update(configsTable)
      .set({ value: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(configsTable.id, cfg.id))
    console.log('[database] Merged default menu entries into dashboard.menu')
  }
}
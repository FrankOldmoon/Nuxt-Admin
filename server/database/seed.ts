import { and, count, eq, inArray } from 'drizzle-orm'
import type { Database } from './index'
import {
  users as usersTable,
  roles as rolesTable,
  configs as configsTable,
  membershipPlans as membershipPlansTable,
  templates as templatesTable
} from './schema'

/**
 * Build a Tiptap JSON doc from simple markdown-ish lines, for the rich text
 * `content` column (seeded showcase data). Supports headings, bullet/ordered
 * lists and blockquotes; anything else becomes a paragraph.
 */
function richDoc(text: string): Record<string, unknown> {
  const lines = text.split('\n')
  const blocks: Record<string, unknown>[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    if (/^#{1,6}\s+/.test(line)) {
      const level = line.match(/^#+/)![0].length
      blocks.push({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: line.replace(/^#+\s*/, '') }] })
      i++
    } else if (/^[-*+]\s+/.test(line)) {
      const items: Record<string, unknown>[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: lines[i].trim().replace(/^[-*+]\s+/, '') }] }] })
        i++
      }
      blocks.push({ type: 'bulletList', content: items })
    } else if (/^\d+\.\s+/.test(line)) {
      const items: Record<string, unknown>[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: lines[i].trim().replace(/^\d+\.\s+/, '') }] }] })
        i++
      }
      blocks.push({ type: 'orderedList', content: items })
    } else if (/^>\s?/.test(line)) {
      const quote: Record<string, unknown>[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push({ type: 'paragraph', content: [{ type: 'text', text: lines[i].trim().replace(/^>\s?/, '') }] })
        i++
      }
      blocks.push({ type: 'blockquote', content: quote })
    } else {
      blocks.push({ type: 'paragraph', content: [{ type: 'text', text: line }] })
      i++
    }
  }
  return { type: 'doc', content: blocks }
}

const SITE_TITLE = 'OfficeBao'
const SITE_TITLE_ZH = '办公宝'
const SITE_TITLE_ZH_TW = '辦公寶'
const SITE_DESCRIPTION = 'Browser-based PDF, image, video and everyday work tools for teachers and office work — merge PDFs, compress images, edit video and more. Your files never leave your device.'
const SITE_DESCRIPTION_ZH = '浏览器里的 PDF、图片、视频与日常办公工具：合并拆分、压缩转换、去水印、座位表、计分板等，文件不上传服务器。'
const SITE_DESCRIPTION_ZH_TW = '瀏覽器裡的 PDF、圖片、影片與日常辦公工具：合併拆分、壓縮轉換、去浮水印、座位表、計分板等，檔案不上傳伺服器。'

// The header carries the three public entries only: the education catalogue,
// pricing and the about page. Blog and Dashboard stay behind the modules and
// the signed-in menu.
const SITE_NAVIGATION = JSON.stringify([
  { label: '教育宝', url: '/edu', order: 10 },
  { label: '价格', url: '/membership', order: 20 },
  { label: '关于', url: '/about', order: 30 }
])

/**
 * Header menus shipped by earlier versions (Blog/Dashboard, membership-only and
 * the single "School home" entry). A stored menu is upgraded to SITE_NAVIGATION
 * only while it still matches one of these, so later admin edits survive
 * restarts. Compared as label+url pairs so JSON formatting does not matter.
 */
const LEGACY_NAVIGATIONS: Array<Array<{ label: string, url: string }>> = [
  [
    { label: 'Blog', url: '/blog' },
    { label: 'Membership', url: '/membership' },
    { label: 'Dashboard', url: '/dashboard' }
  ],
  [{ label: 'Membership', url: '/membership' }],
  [{ label: 'School home', url: '/' }]
]

function isLegacyNavigation(raw: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  if (!Array.isArray(parsed)) return false
  const entries = parsed.filter(item => item && typeof item === 'object') as Array<{ label?: string, url?: string }>
  const keyOf = (item: { label?: string, url?: string }) => `${item.label}\u0000${item.url}`
  const stored = new Set(entries.map(keyOf))
  return LEGACY_NAVIGATIONS.some(shape => shape.length === entries.length
    && shape.every(item => stored.has(keyOf(item))))
}

const DEFAULT_CONFIGS = [
  { key: 'site.title', value: SITE_TITLE, type: 'string', description: 'Site title (used in <title>, Open Graph and search results)' },
  { key: 'site.titleZh', value: SITE_TITLE_ZH, type: 'string', description: 'Chinese site title (falls back to site.title when blank)' },
  { key: 'site.titleZhTw', value: SITE_TITLE_ZH_TW, type: 'string', description: 'Traditional Chinese site title (falls back to site.titleZh when blank)' },
  { key: 'site.description', value: SITE_DESCRIPTION, type: 'string', description: 'Default meta description for pages that do not set their own' },
  { key: 'site.descriptionZh', value: SITE_DESCRIPTION_ZH, type: 'string', description: 'Chinese default meta description (falls back to site.description when blank)' },
  { key: 'site.descriptionZhTw', value: SITE_DESCRIPTION_ZH_TW, type: 'string', description: 'Traditional Chinese default meta description (falls back to site.descriptionZh when blank)' },
  { key: 'site.url', value: '', type: 'string', description: 'Canonical site URL, e.g. https://example.com (used by sitemap.xml and robots.txt; blank = request origin)' },
  { key: 'site.ogImage', value: '', type: 'string', description: 'Absolute URL or /path of the default share image (1200x630 PNG/JPG, blank = no og:image)' },
  // ---- Search-engine ownership proofs (blank = no tag) ----
  { key: 'seo.googleSiteVerification', value: '', type: 'string', description: 'Google Search Console verification token (the content value of google-site-verification)' },
  { key: 'seo.bingSiteVerification', value: '', type: 'string', description: 'Bing Webmaster Tools verification token (msvalidate.01)' },
  { key: 'seo.baiduSiteVerification', value: '', type: 'string', description: 'Baidu 站点验证码 (baidu-site-verification, e.g. codeva-xxxx)' },
  { key: 'site.allowRegistration', value: 'true', type: 'boolean', description: 'Allow public registration' },
  { key: 'blog.enabled', value: 'true', type: 'boolean', description: 'Enable the blog module (registers its tables, API and sidebar menu)' },
  { key: 'mail.from', value: 'no-reply@example.com', type: 'string', description: 'From address for outgoing mail' },
  { key: 'mail.host', value: '', type: 'string', description: 'SMTP host' },
  { key: 'mail.port', value: '587', type: 'number', description: 'SMTP port' },
  { key: 'mail.secure', value: 'false', type: 'boolean', description: 'Use SSL/TLS (true for 465, false for 587)' },
  { key: 'mail.user', value: '', type: 'string', description: 'SMTP username' },
  { key: 'mail.pass', value: '', type: 'string', description: 'SMTP password' },
  { key: 'security.passwordResetTtlMinutes', value: '30', type: 'number', description: 'Password reset token TTL (minutes)' },
  { key: 'security.emailVerificationTtlMinutes', value: '1440', type: 'number', description: 'Email verification token TTL (minutes)' },
  { key: 'security.sessionTtlDays', value: '7', type: 'number', description: 'Session token TTL (days)' },
  { key: 'security.captchaEnabled', value: 'false', type: 'boolean', description: 'Enable graphic captcha on the login page' },
  { key: 'security.captchaSecret', value: '', type: 'string', description: 'CAPTCHA HMAC signing secret (leave blank to use env NUXT_CAPTCHA_SECRET or the dev default)' },
  { key: 'security.loginMaxAttempts', value: '5', type: 'number', description: 'Number of consecutive failed logins before the account is locked' },
  { key: 'security.loginLockMinutes', value: '15', type: 'number', description: 'Account lock duration (minutes)' },
  // ---- Third-party / SSO (OAuth2) configs ----
  { key: 'oauth.github.enabled', value: 'false', type: 'boolean', description: 'Enable "Sign in with GitHub" (OAuth2). Requires clientId/clientSecret below.' },
  { key: 'oauth.github.clientId', value: '', type: 'string', description: 'GitHub OAuth App Client ID' },
  { key: 'oauth.github.clientSecret', value: '', type: 'string', description: 'GitHub OAuth App Client Secret' },
  { key: 'oauth.google.enabled', value: 'false', type: 'boolean', description: 'Enable "Sign in with Google" (OAuth2/OIDC). Requires clientId/clientSecret below.' },
  { key: 'oauth.google.clientId', value: '', type: 'string', description: 'Google OAuth Client ID' },
  { key: 'oauth.google.clientSecret', value: '', type: 'string', description: 'Google OAuth Client Secret' },
  { key: 'oauth.microsoft.enabled', value: 'false', type: 'boolean', description: 'Enable "Sign in with Microsoft" (Entra ID / personal accounts, v2.0 common endpoint). Requires clientId/clientSecret below.' },
  { key: 'oauth.microsoft.clientId', value: '', type: 'string', description: 'Microsoft OAuth Application (client) ID' },
  { key: 'oauth.microsoft.clientSecret', value: '', type: 'string', description: 'Microsoft OAuth Client Secret' },
  { key: 'oauth.provision', value: 'true', type: 'boolean', description: 'Auto-create a local account on first SSO sign-in when no account is linked yet' },
  { key: 'oauth.defaultRoleName', value: 'user', type: 'string', description: 'Role assigned to SSO users created by auto-provisioning' },
  { key: 'oauth.callbackRedirect', value: '/', type: 'string', description: 'Frontend path to redirect to after a successful SSO sign-in (default "/")' },
  // ---- OAuth 2.0 / OIDC provider (this site as an identity provider) ----
  { key: 'oauthServer.enabled', value: 'true', type: 'boolean', description: 'Enable the OAuth 2.0 / OpenID Connect provider (let other apps sign in with this site)' },
  { key: 'oauthServer.issuer', value: '', type: 'string', description: 'Issuer identifier (blank = request origin)' },
  { key: 'oauthServer.privateKey', value: '', type: 'string', description: 'RS256 signing key (auto-generated on first use, do not share)' },
  { key: 'upload.maxFileSize', value: '10', type: 'number', description: 'Max upload file size (MB)' },
  { key: 'upload.allowedMimeTypes', value: '', type: 'string', description: 'Allowed upload MIME types (comma-separated, empty = all)' },
  // ---- WeChat Mini Program configs ----
  { key: 'wx.appid', value: 'wx17e518ae011cb1f9', type: 'string', description: 'WeChat Mini Program AppID (for phone number / openid APIs)' },
  { key: 'wx.secret', value: '', type: 'string', description: 'WeChat Mini Program AppSecret' },
  { key: 'wx.sessionTtlDays', value: '30', type: 'number', description: 'Mini-program session token TTL (days)' },
  { key: 'wx.pay.enabled', value: 'false', type: 'boolean', description: 'Enable WeChat Pay v3 (mini-program JSAPI + web Native/QR)' },
  { key: 'wx.pay.mchid', value: '', type: 'string', description: 'WeChat Pay merchant ID (mchid)' },
  { key: 'wx.pay.serialNo', value: '', type: 'string', description: 'Merchant API certificate serial number' },
  { key: 'wx.pay.privateKey', value: '', type: 'string', description: 'Merchant API private key (full PEM text with BEGIN/END lines)' },
  { key: 'wx.pay.apiv3Key', value: '', type: 'string', description: 'WeChat Pay APIv3 key (32 chars)' },
  { key: 'wx.pay.notifyUrl', value: '', type: 'string', description: 'Payment notify callback URL (e.g. https://your.host/api/wx/pay/notify)' },
  { key: 'wx.pay.nativeAppId', value: '', type: 'string', description: 'Official-account AppID used for Native/QR web payments; falls back to wx.appid when empty' },
  // ---- Stripe payment configs ----
  { key: 'stripe.enabled', value: 'false', type: 'boolean', description: 'Enable Stripe Checkout payments' },
  { key: 'stripe.secretKey', value: '', type: 'string', description: 'Stripe API secret key (sk_test_... / sk_live_...)' },
  { key: 'stripe.webhookSecret', value: '', type: 'string', description: 'Stripe webhook signing secret (whsec_...) for /api/stripe/pay/notify' },
  { key: 'stripe.currency', value: 'usd', type: 'string', description: 'Default charge currency (ISO code, e.g. usd)' },
  { key: 'stripe.successUrl', value: '/', type: 'string', description: 'Redirect path after successful payment (absolute URL or path, default "/")' },
  { key: 'stripe.cancelUrl', value: '/', type: 'string', description: 'Redirect path after cancelled payment (absolute URL or path, default "/")' },
  // ---- Alipay (page pay, RSA2) ----
  { key: 'alipay.enabled', value: 'false', type: 'boolean', description: 'Enable Alipay page pay (web cashier redirect)' },
  { key: 'alipay.appId', value: '', type: 'string', description: 'Alipay application AppID (支付宝开放平台应用 APPID)' },
  { key: 'alipay.privateKey', value: '', type: 'string', description: 'Alipay app private key (PEM or bare base64, used to sign requests)' },
  { key: 'alipay.publicKey', value: '', type: 'string', description: 'Alipay public key (PEM or bare base64, used to verify notify signatures)' },
  { key: 'alipay.gateway', value: 'https://openapi.alipay.com/gateway.do', type: 'string', description: 'Alipay gateway URL (use sandbox gateway for testing)' },
  { key: 'alipay.notifyUrl', value: '', type: 'string', description: 'Async notify URL (defaults to <site>/api/alipay/pay/notify when empty)' },
  { key: 'alipay.returnUrl', value: '', type: 'string', description: 'Browser return URL after payment (optional)' },
  // ---- Analytics / tracking configs (public: IDs end up in the client HTML anyway) ----
  { key: 'analytics.googleAnalyticsId', value: '', type: 'string', description: 'Google Analytics 4 Measurement ID (e.g. G-XXXXXXXXXX, empty = disabled)' },
  { key: 'analytics.googleAdsId', value: '', type: 'string', description: 'Google Ads Conversion ID (e.g. AW-XXXXXXXXX, empty = disabled)' },
  { key: 'analytics.baiduTongjiId', value: '', type: 'string', description: 'Baidu Analytics (百度统计) site ID — the hm.js?xxxxxx token, empty = disabled' },
  // ---- Membership / subscription configs ----
  { key: 'membership.enabled', value: 'true', type: 'boolean', description: 'Enable paid membership subscriptions (plans + checkout)' },
  { key: 'membership.successUrl', value: '/membership', type: 'string', description: 'Redirect path after a successful membership payment (default "/membership")' },
  { key: 'membership.cancelUrl', value: '/membership', type: 'string', description: 'Redirect path after a cancelled membership payment (default "/membership")' },
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
  {
    key: 'site.navigation',
    value: SITE_NAVIGATION,
    type: 'json',
    description: 'Home page header navigation links (JSON array, each item contains label/url/order/hidden)'
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

  // 0a. Replace the scaffolding-era site title/description. Only rows still
  // holding an old default are touched, so an admin's own copy is preserved.
  await db.update(configsTable)
    .set({ value: SITE_TITLE, updatedAt: new Date() })
    .where(and(
      eq(configsTable.key, 'site.title'),
      inArray(configsTable.value, ['Nuxt Admin', 'Lesson Desk'])
    ))
  await db.update(configsTable)
    .set({ value: SITE_DESCRIPTION, updatedAt: new Date() })
    .where(and(
      eq(configsTable.key, 'site.description'),
      inArray(configsTable.value, [
        'A production-grade, metadata-driven admin framework built with Nuxt 4.',
        'Free browser-based PDF, image, video and classroom tools for teachers: merge PDFs, compress images, build seating charts and more. Files never leave your device.'
      ])
    ))
  // Chinese title/description added with the brand rename: fill them when unset.
  await db.update(configsTable)
    .set({ value: SITE_TITLE_ZH, updatedAt: new Date() })
    .where(and(eq(configsTable.key, 'site.titleZh'), eq(configsTable.value, '')))
  await db.update(configsTable)
    .set({ value: SITE_DESCRIPTION_ZH, updatedAt: new Date() })
    .where(and(eq(configsTable.key, 'site.descriptionZh'), eq(configsTable.value, '')))
  await db.update(configsTable)
    .set({ value: SITE_TITLE_ZH_TW, updatedAt: new Date() })
    .where(and(eq(configsTable.key, 'site.titleZhTw'), eq(configsTable.value, '')))
  await db.update(configsTable)
    .set({ value: SITE_DESCRIPTION_ZH_TW, updatedAt: new Date() })
    .where(and(eq(configsTable.key, 'site.descriptionZhTw'), eq(configsTable.value, '')))
  // Header links shipped earlier (Blog/Dashboard, then Membership-only): replace
  // them only while the row still holds one of those exact defaults, so an
  // admin's own menu is preserved.
  const [navRow] = await db
    .select({ value: configsTable.value })
    .from(configsTable)
    .where(eq(configsTable.key, 'site.navigation'))
    .limit(1)
  if (navRow && isLegacyNavigation(navRow.value)) {
    await db.update(configsTable)
      .set({ value: SITE_NAVIGATION, updatedAt: new Date() })
      .where(eq(configsTable.key, 'site.navigation'))
  }

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
        content: richDoc('# Invoice Layout\n\n- **Pages:** 1\n- **Format:** PDF + DOCX\n\n> Customize the header, footer and tax block.'),
        releasedAt: new Date('2026-06-01T00:00:00.000Z')
      },
      {
        name: 'Resume Template', sku: 'TPL-RSM-02', price: 39.5, stock: 8,
        status: 'active', coverImage: '', docFile: [], tags: ['featured'],
        description: 'One-page modern resume template.',
        meta: { color: 'white', pages: '1' },
        content: richDoc('## Resume Template\n\nATS-friendly sections with a clean timeline.\n\n| Spec | Value |\n|------|-------|\n| Pages | 1 |\n| ATS | Yes |'),
        releasedAt: new Date('2026-07-15T00:00:00.000Z')
      },
      {
        name: 'Email Newsletter', sku: 'TPL-EML-03', price: 329, stock: 0,
        status: 'draft', coverImage: '', docFile: [], tags: ['sale'],
        description: 'Responsive email newsletter template.',
        meta: { client: 'MJML', width: '600px' },
        content: richDoc('## Email Newsletter\n\n- 600px responsive\n- MJML source\n\n### Coming soon\n\nInclude drag-and-drop blocks.'),
        releasedAt: new Date('2026-09-01T00:00:00.000Z')
      },
      {
        name: 'Product Card', sku: 'TPL-PRD-04', price: 89.99, stock: 15,
        status: 'active', coverImage: '', docFile: [], tags: ['new', 'sale', 'featured'],
        description: 'E-commerce product card template.',
        meta: { format: 'PNG', ratio: '1:1' },
        content: richDoc('## Product Card\n\nEverything you need for e-commerce:\n\n1. Price & discount badge\n2. Star rating\n3. Add-to-cart'),
        releasedAt: new Date('2026-08-10T00:00:00.000Z')
      },
      {
        name: 'Landing Hero', sku: 'TPL-LND-05', price: 12.5, stock: 4,
        status: 'archived', coverImage: '', docFile: [], tags: ['refurbished'],
        description: 'Landing page hero section template.',
        meta: { format: 'Figma' },
        content: richDoc('> Discontinued — limited refurbished stock only.'),
        releasedAt: new Date('2025-11-20T00:00:00.000Z')
      }
    ])
    console.log('[database] Seeded templates showcase data (5 rows)')
  }

  // 0d. Membership plans (idempotent: only seeds when the table is empty).
  // Priced in CNY because the default deployment is the mainland-China edition
  // and the enabled payment channels (Alipay / WeChat Pay) settle in CNY only.
  const [planCount] = await db.select({ value: count() }).from(membershipPlansTable)
  if (Number(planCount?.value ?? 0) === 0) {
    await db.insert(membershipPlansTable).values([
      {
        slug: 'monthly',
        nameEn: 'Monthly',
        nameZh: '月度会员',
        description: '30 days of full membership access.',
        durationDays: 30,
        priceCents: 2900,
        currency: 'cny',
        sortOrder: 10
      },
      {
        slug: 'quarterly',
        nameEn: 'Quarterly',
        nameZh: '季度会员',
        description: '90 days of full membership access, about 10% off monthly.',
        durationDays: 90,
        priceCents: 7900,
        currency: 'cny',
        sortOrder: 20,
        isFeatured: true
      },
      {
        slug: 'yearly',
        nameEn: 'Yearly',
        nameZh: '年度会员',
        description: '365 days of full membership access, about 28% off monthly.',
        durationDays: 365,
        priceCents: 24900,
        currency: 'cny',
        sortOrder: 30
      }
    ])
    console.log('[database] Seeded membership plans (3 rows)')
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
const NEW_DEFAULT_MENU_ENTRIES: Array<{ table: string, label: string, icon: string, order: number }> = [
  { table: 'templates', label: 'Templates', icon: 'i-lucide-file-text', order: 25 },
  { table: 'oauthClients', label: 'OAuth Clients', icon: 'i-lucide-key-round', order: 47 }
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

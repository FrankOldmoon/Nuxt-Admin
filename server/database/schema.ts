import {
  pgTable,
  serial,
  varchar,
  timestamp,
  boolean,
  integer,
  text,
  date,
  time,
  jsonb,
  uniqueIndex,
  index,
  foreignKey,
  doublePrecision
} from 'drizzle-orm/pg-core'

export const roles = pgTable(
  'roles',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).notNull(),
    description: varchar('description', { length: 255 }),
    // Array of backend table names this role is allowed to access; '*' means all.
    // The admin role defaults to ['*'].
    permissions: jsonb('permissions').$type<string[]>().default([]).notNull(),
    // Data scope: all (all rows) / self (own records only)
    dataScope: varchar('data_scope', { length: 20 }).default('all').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  table => ({
    nameIdx: uniqueIndex('roles_name_idx').on(table.name)
  })
)

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }),
    email: varchar('email', { length: 255 }).notNull(),
    telephone: varchar('telephone', { length: 30 }),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    avatarPath: varchar('avatar_path', { length: 500 }),
    isActive: boolean('is_active').default(true).notNull(),
    roleId: integer('role_id').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    gender: varchar('gender', { length: 20 }),
    birthday: date('birthday'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastLoginIp: varchar('last_login_ip', { length: 45 }),
    // Login security: failed-login counter + lockout deadline
    failedLoginCount: integer('failed_login_count').default(0).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    usernameIdx: uniqueIndex('users_username_idx').on(table.username),
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    roleFk: foreignKey({ columns: [table.roleId], foreignColumns: [roles.id] })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

// Third-party / SSO (OAuth2) account links. One user can link multiple providers,
// and a single external account maps to exactly one local user.
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    name: varchar('name', { length: 255 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    uniqueProviderAccount: uniqueIndex('oauth_accounts_provider_account_idx')
      .on(table.provider, table.providerAccountId),
    userIdx: index('oauth_accounts_user_idx').on(table.userId),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

export type OAuthAccount = typeof oauthAccounts.$inferSelect
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert

// Membership (subscription) plans. A plan is a purchasable option granting
// `durationDays` of membership. Prices are stored in the smallest currency unit.
export const membershipPlans = pgTable(
  'membership_plans',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 50 }).notNull(),
    nameEn: varchar('name_en', { length: 100 }).notNull(),
    nameZh: varchar('name_zh', { length: 100 }).notNull(),
    description: varchar('description', { length: 255 }),
    durationDays: integer('duration_days').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: varchar('currency', { length: 10 }).default('usd').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    // Optional "recommended" badge flag rendered on the pricing page
    isFeatured: boolean('is_featured').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  table => ({
    slugIdx: uniqueIndex('membership_plans_slug_idx').on(table.slug)
  })
)

export type MembershipPlan = typeof membershipPlans.$inferSelect
export type NewMembershipPlan = typeof membershipPlans.$inferInsert

// Membership subscriptions. The active membership is the subscription with
// status='active' and the furthest expiresAt in the future, so renewals can
// simply stack / extend the existing period.
export const membershipSubscriptions = pgTable(
  'membership_subscriptions',
  {
    id: serial('id').primaryKey(),
    // Payer identity: exactly one of userId (website account) / wxUserId (mini-program)
    userId: integer('user_id'),
    wxUserId: integer('wx_user_id'),
    planId: integer('plan_id'),
    // active | expired | cancelled
    status: varchar('status', { length: 20 }).default('active').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Payment source: stripe | wechat | manual
    source: varchar('source', { length: 20 }).default('stripe').notNull(),
    outTradeNo: varchar('out_trade_no', { length: 64 }),
    amountCents: integer('amount_cents'),
    // Admin who granted/cancelled the subscription (manual operations)
    grantedBy: integer('granted_by'),
    note: varchar('note', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    userIdx: index('membership_subscriptions_user_idx').on(table.userId),
    wxUserIdx: index('membership_subscriptions_wx_user_idx').on(table.wxUserId),
    statusIdx: index('membership_subscriptions_status_idx').on(table.status),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    planFk: foreignKey({ columns: [table.planId], foreignColumns: [membershipPlans.id] })
      .onDelete('set null')
      .onUpdate('cascade')
  })
)

export type MembershipSubscription = typeof membershipSubscriptions.$inferSelect
export type NewMembershipSubscription = typeof membershipSubscriptions.$inferInsert

export const configs = pgTable(
  'configs',
  {
    id: serial('id').primaryKey(),
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value').notNull(),
    type: varchar('type', { length: 20 }).default('string').notNull(),
    description: varchar('description', { length: 255 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    keyIdx: uniqueIndex('configs_key_idx').on(table.key)
  })
)

// Persisted auth tokens (server-side, revocable). Holds session, password-reset
// and email-verification tokens distinguished by the `type` column.
export const tokens = pgTable(
  'tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    type: varchar('type', { length: 20 }).default('session').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    tokenHashIdx: uniqueIndex('tokens_token_hash_idx').on(table.tokenHash),
    userTypeIdx: index('tokens_user_type_idx').on(table.userId, table.type),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

// File records (uploads), tracked per user
export const files = pgTable(
  'files',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    hash: varchar('hash', { length: 64 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }),
    size: integer('size').default(0).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    storage: varchar('storage', { length: 20 }).default('local').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    hashIdx: uniqueIndex('files_hash_idx').on(table.hash),
    userIdx: index('files_user_id_idx').on(table.userId)
  })
)

export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Config = typeof configs.$inferSelect
export type NewConfig = typeof configs.$inferInsert

export type Token = typeof tokens.$inferSelect
export type NewToken = typeof tokens.$inferInsert

// Notifications created by admins. targetUserIds null = broadcast to all;
// non-null array = only send to those user IDs.
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    createdBy: integer('created_by').notNull(),
    targetUserIds: integer('target_user_ids').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  table => ({
    createdByFk: foreignKey({ columns: [table.createdBy], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    createdByIdx: index('notifications_created_by_idx').on(table.createdBy)
  })
)
export const notificationReads = pgTable(
  'notification_reads',
  {
    id: serial('id').primaryKey(),
    notificationId: integer('notification_id').notNull(),
    userId: integer('user_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    notifUserIdx: uniqueIndex('notification_reads_notif_user_idx').on(table.notificationId, table.userId),
    notifFk: foreignKey({ columns: [table.notificationId], foreignColumns: [notifications.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

// Private messages between users
export const privateMessages = pgTable(
  'private_messages',
  {
    id: serial('id').primaryKey(),
    senderId: integer('sender_id').notNull(),
    receiverId: integer('receiver_id').notNull(),
    content: text('content').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    senderFk: foreignKey({ columns: [table.senderId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    receiverFk: foreignKey({ columns: [table.receiverId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    senderReceiverIdx: index('private_messages_sender_receiver_idx').on(table.senderId, table.receiverId, table.createdAt),
    receiverSenderIdx: index('private_messages_receiver_sender_idx').on(table.receiverId, table.senderId, table.createdAt)
  })
)

export type FileRecord = typeof files.$inferSelect
export type NewFileRecord = typeof files.$inferInsert

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

export type NotificationRead = typeof notificationReads.$inferSelect
export type NewNotificationRead = typeof notificationReads.$inferInsert

export type PrivateMessage = typeof privateMessages.$inferSelect
export type NewPrivateMessage = typeof privateMessages.$inferInsert

// ------------------------------------------------------------------
// Templates — rich showcase table for the "personalization ladder".
// Intended to exercise the framework's customization points: rich FieldMeta
// (field types, select options, tags, json, markdown, relation, image, file),
// an owning `userId` FK, and a `template_users` many-to-many pivot.
// ------------------------------------------------------------------
export const templates = pgTable(
  'templates',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    sku: varchar('sku', { length: 50 }),
    price: doublePrecision('price'),
    stock: integer('stock').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    coverImage: varchar('cover_image', { length: 500 }),
    docFile: jsonb('doc_file').$type<string[]>().default([]).notNull(),
    userId: integer('user_id'),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    description: text('description'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    // Rich text body — stored as a Tiptap JSON document (jsonb).
    content: jsonb('content').$type<Record<string, unknown> | null>(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    launchDate: date('launch_date'),
    openingTime: time('opening_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  table => ({
    statusIdx: index('templates_status_idx').on(table.status),
    userIdx: index('templates_user_idx').on(table.userId),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('set null')
      .onUpdate('cascade')
  })
)

export type Template = typeof templates.$inferSelect
export type NewTemplate = typeof templates.$inferInsert

// Many-to-many pivot between templates ↔ users. Auto-discovered by convention
// (two `*_id` FK columns): templates gains a virtual `userIds` field, users a
// virtual `templateIds` field.
export const templateUsers = pgTable(
  'template_users',
  {
    id: serial('id').primaryKey(),
    templateId: integer('template_id').notNull(),
    userId: integer('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    pairIdx: uniqueIndex('template_users_pair_idx').on(table.templateId, table.userId),
    templateFk: foreignKey({ columns: [table.templateId], foreignColumns: [templates.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

export type TemplateUser = typeof templateUsers.$inferSelect
export type NewTemplateUser = typeof templateUsers.$inferInsert

// ------------------------------------------------------------------
// WeChat Mini Program — users / sessions / pay orders.
// wxUsers: one row per WeChat openid (auto-created on first wx/login).
// `userId` optionally links to a local admin-system account (Plan A: separate table + optional binding).
// ------------------------------------------------------------------
export const wxUsers = pgTable(
  'wx_users',
  {
    id: serial('id').primaryKey(),
    openid: varchar('openid', { length: 64 }).notNull(),
    unionid: varchar('unionid', { length: 64 }),
    // Latest session_key from code2session (kept for future decrypt needs, e.g. phone data)
    sessionKey: varchar('session_key', { length: 64 }),
    nickname: varchar('nickname', { length: 100 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    phoneNumber: varchar('phone_number', { length: 30 }),
    countryCode: varchar('country_code', { length: 10 }),
    // Optional link to the local admin user account (binding via phone/profile)
    userId: integer('user_id'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    openidIdx: uniqueIndex('wx_users_openid_idx').on(table.openid),
    unionidIdx: index('wx_users_unionid_idx').on(table.unionid),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('set null')
      .onUpdate('cascade')
  })
)

// Mini-program sessions (Bearer token in the `Authorization` header).
// Separate from the admin `tokens` table because its userId FK points to users.
export const wxSessions = pgTable(
  'wx_sessions',
  {
    id: serial('id').primaryKey(),
    wxUserId: integer('wx_user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    tokenHashIdx: uniqueIndex('wx_sessions_token_hash_idx').on(table.tokenHash),
    wxUserIdx: index('wx_sessions_wx_user_idx').on(table.wxUserId),
    wxUserFk: foreignKey({ columns: [table.wxUserId], foreignColumns: [wxUsers.id] })
      .onDelete('cascade')
      .onUpdate('cascade')
  })
)

// WeChat Pay v3 orders (JSAPI). amount is in cents (fen).
export const wxPayOrders = pgTable(
  'wx_pay_orders',
  {
    id: serial('id').primaryKey(),
    // Merchant order number (out_trade_no), generated server-side
    outTradeNo: varchar('out_trade_no', { length: 32 }).notNull(),
    // Mini-program payer (null for web/Native orders paid by a dashboard user)
    wxUserId: integer('wx_user_id'),
    // Dashboard user payer (null for mini-program orders)
    userId: integer('user_id'),
    openid: varchar('openid', { length: 64 }),
    amount: integer('amount').notNull(),
    description: varchar('description', { length: 127 }).notNull(),
    // pending | success | closed
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    // Business type of the purchase: generic | membership
    bizType: varchar('biz_type', { length: 20 }).default('generic').notNull(),
    // Business reference id (e.g. membership plan id), interpreted per bizType
    bizRefId: integer('biz_ref_id'),
    transactionId: varchar('transaction_id', { length: 64 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // Raw notify payload kept for audit
    callbackPayload: jsonb('callback_payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    outTradeNoIdx: uniqueIndex('wx_pay_orders_out_trade_no_idx').on(table.outTradeNo),
    wxUserIdx: index('wx_pay_orders_wx_user_idx').on(table.wxUserId),
    userIdx: index('wx_pay_orders_user_idx').on(table.userId),
    wxUserFk: foreignKey({ columns: [table.wxUserId], foreignColumns: [wxUsers.id] })
      .onDelete('set null')
      .onUpdate('cascade'),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('set null')
      .onUpdate('cascade')
  })
)

export type WxUser = typeof wxUsers.$inferSelect
export type NewWxUser = typeof wxUsers.$inferInsert
export type WxSession = typeof wxSessions.$inferSelect
export type NewWxSession = typeof wxSessions.$inferInsert
export type WxPayOrder = typeof wxPayOrders.$inferSelect
export type NewWxPayOrder = typeof wxPayOrders.$inferInsert

// Alipay orders (web page pay / QR). amount is in cents (fen), like WeChat Pay.
export const alipayOrders = pgTable(
  'alipay_orders',
  {
    id: serial('id').primaryKey(),
    // Merchant order number (out_trade_no), generated server-side
    outTradeNo: varchar('out_trade_no', { length: 64 }).notNull(),
    // Dashboard user payer (Alipay is only offered on the website for now)
    userId: integer('user_id'),
    // Alipay trade number (trade_no), filled in by the notify callback
    tradeNo: varchar('trade_no', { length: 64 }),
    amount: integer('amount').notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    // pending | success | closed
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    // Business type of the purchase: generic | membership
    bizType: varchar('biz_type', { length: 20 }).default('generic').notNull(),
    // Business reference id (e.g. membership plan id), interpreted per bizType
    bizRefId: integer('biz_ref_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // Raw notify payload kept for audit
    callbackPayload: jsonb('callback_payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    outTradeNoIdx: uniqueIndex('alipay_orders_out_trade_no_idx').on(table.outTradeNo),
    tradeNoIdx: index('alipay_orders_trade_no_idx').on(table.tradeNo),
    userIdx: index('alipay_orders_user_idx').on(table.userId),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('set null')
      .onUpdate('cascade')
  })
)

export type AlipayOrder = typeof alipayOrders.$inferSelect
export type NewAlipayOrder = typeof alipayOrders.$inferInsert

// Stripe Checkout orders. amount is in the smallest currency unit (cents).
export const stripeOrders = pgTable(
  'stripe_orders',
  {
    id: serial('id').primaryKey(),
    // Merchant order number (client_reference_id), generated server-side
    outTradeNo: varchar('out_trade_no', { length: 64 }).notNull(),
    userId: integer('user_id'),
    email: varchar('email', { length: 255 }),
    // Amount in cents, stored together with its currency (e.g. usd)
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    // Stripe Checkout Session id (cs_...)
    sessionId: varchar('session_id', { length: 255 }),
    // pending | paid | closed
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    // Business type of the purchase: generic | membership
    bizType: varchar('biz_type', { length: 20 }).default('generic').notNull(),
    // Business reference id (e.g. membership plan id), interpreted per bizType
    bizRefId: integer('biz_ref_id'),
    transactionId: varchar('transaction_id', { length: 255 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // Raw webhook payload kept for audit
    callbackPayload: jsonb('callback_payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    outTradeNoIdx: uniqueIndex('stripe_orders_out_trade_no_idx').on(table.outTradeNo),
    sessionIdx: index('stripe_orders_session_idx').on(table.sessionId),
    userFk: foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('set null')
      .onUpdate('cascade')
  })
)

export type StripeOrder = typeof stripeOrders.$inferSelect
export type NewStripeOrder = typeof stripeOrders.$inferInsert

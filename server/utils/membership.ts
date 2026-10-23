import { and, desc, eq, gt, isNull, lte } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from './db'
import {
  membershipPlans,
  membershipSubscriptions,
  type MembershipPlan,
  type MembershipSubscription
} from '../database/schema'
import { getConfigValue } from './configs'

// Membership / subscription helpers.
//
// Source of truth is the `membership_subscriptions` table: a user is a member
// when they own a subscription with status='active' and expiresAt in the
// future. Renewals stack by starting the new period at the end of the current
// one, so paying twice simply extends the expiry date.
//
// A subscriber is either a website account (`userId`) or a mini-program user
// (`wxUserId`) — exactly one of them identifies the payer.

const DAY_MS = 24 * 60 * 60 * 1000

/** Payer identity: a website user id or a WeChat mini-program user id. */
export type MemberIdentity = { userId: number } | { wxUserId: number }

function identityWhere(identity: MemberIdentity) {
  return 'userId' in identity
    ? eq(membershipSubscriptions.userId, identity.userId)
    : eq(membershipSubscriptions.wxUserId, identity.wxUserId)
}

export async function isMembershipEnabled(): Promise<boolean> {
  return await getConfigValue<boolean>('membership.enabled', true)
}

export async function requireMembershipEnabled(): Promise<void> {
  if (!(await isMembershipEnabled())) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Membership disabled (set membership.enabled = true in dashboard configs)'
    })
  }
}

export interface ActiveMembership {
  subscription: MembershipSubscription
  plan: MembershipPlan | null
  /** Remaining whole days until expiry (>= 0) */
  daysLeft: number
}

/** Return the payer's currently active membership (furthest expiry), or null. */
export async function getActiveMembership(identity: MemberIdentity): Promise<ActiveMembership | null> {
  const now = new Date()
  const [row] = await db.select({
    subscription: membershipSubscriptions,
    plan: membershipPlans
  })
    .from(membershipSubscriptions)
    .leftJoin(membershipPlans, eq(membershipSubscriptions.planId, membershipPlans.id))
    .where(and(
      identityWhere(identity),
      eq(membershipSubscriptions.status, 'active'),
      gt(membershipSubscriptions.expiresAt, now)
    ))
    .orderBy(desc(membershipSubscriptions.expiresAt))
    .limit(1)

  if (!row) return null
  const daysLeft = Math.max(0, Math.ceil((row.subscription.expiresAt.getTime() - now.getTime()) / DAY_MS))
  return { subscription: row.subscription, plan: row.plan ?? null, daysLeft }
}

/**
 * Grant (or renew) membership for a user.
 *
 * - If the user still has an active membership, the new period starts when the
 *   current one ends (stacking). Otherwise it starts now.
 * - Writes a new subscription row so every grant keeps its own audit trail
 *   (order number, amount, source, operator).
 */
export async function activateMembership(input: MemberIdentity & {
  planId?: number | null
  source?: 'stripe' | 'wechat' | 'manual'
  outTradeNo?: string | null
  amountCents?: number | null
  grantedBy?: number | null
  note?: string | null
  /** Duration in days; resolved from the plan when omitted */
  durationDays?: number
}): Promise<MembershipSubscription> {
  let durationDays = input.durationDays
  if (!durationDays) {
    if (!input.planId) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'planId or durationDays is required' })
    }
    const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, input.planId)).limit(1)
    if (!plan) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Membership plan not found: ${input.planId}` })
    }
    durationDays = plan.durationDays
  }
  if (durationDays <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'durationDays must be positive' })
  }

  const identity: MemberIdentity = 'userId' in input
    ? { userId: input.userId }
    : { wxUserId: input.wxUserId }

  // Mark lapsed subscriptions as expired before stacking a new period
  await db.update(membershipSubscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(
      identityWhere(identity),
      eq(membershipSubscriptions.status, 'active'),
      lte(membershipSubscriptions.expiresAt, new Date())
    ))

  const current = await getActiveMembership(identity)
  const base = current ? current.subscription.expiresAt : new Date()
  const expiresAt = new Date(base.getTime() + durationDays * DAY_MS)

  const [row] = await db.insert(membershipSubscriptions).values({
    userId: 'userId' in input ? input.userId : null,
    wxUserId: 'wxUserId' in input ? input.wxUserId : null,
    planId: input.planId ?? null,
    status: 'active',
    startsAt: base,
    expiresAt,
    source: input.source ?? 'stripe',
    outTradeNo: input.outTradeNo ?? null,
    amountCents: input.amountCents ?? null,
    grantedBy: input.grantedBy ?? null,
    note: input.note ?? null
  }).returning()
  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to activate membership' })
  }

  console.log('[membership] activated | subscriber:', 'userId' in input ? `user:${input.userId}` : `wxUser:${input.wxUserId}`, '| plan:', input.planId ?? '(custom)', '| expires:', expiresAt.toISOString(), '| source:', row.source)
  return row
}

/** Cancel every still-active subscription of a subscriber (admin action). */
export async function revokeMembership(identity: MemberIdentity, grantedBy?: number | null, note?: string | null): Promise<number> {
  const rows = await db.update(membershipSubscriptions)
    .set({ status: 'cancelled', grantedBy: grantedBy ?? null, note: note ?? null, updatedAt: new Date() })
    .where(and(
      identityWhere(identity),
      eq(membershipSubscriptions.status, 'active'),
      gt(membershipSubscriptions.expiresAt, new Date())
    ))
    .returning({ id: membershipSubscriptions.id })
  console.log('[membership] revoked | subscriber:', identity, '| subscriptions:', rows.length)
  return rows.length
}

/** True when the subscriber is currently within a paid membership period. */
export async function userIsMember(identity: MemberIdentity): Promise<boolean> {
  return (await getActiveMembership(identity)) !== null
}

/** Load an active, non-deleted plan by id (throws 404 when unusable). */
export async function getPurchasablePlan(planId: number): Promise<MembershipPlan> {
  const [plan] = await db.select().from(membershipPlans)
    .where(and(
      eq(membershipPlans.id, planId),
      eq(membershipPlans.isActive, true),
      isNull(membershipPlans.deletedAt)
    ))
    .limit(1)
  if (!plan) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Membership plan not found or inactive' })
  }
  return plan
}

/**
 * Post-payment fulfilment shared by every payment channel: when a paid order is
 * flagged as a membership purchase, activate the period for its payer.
 * Returns null when the order carries no membership information (generic order).
 */
export async function fulfilMembershipOrder(order: {
  bizType?: string | null
  bizRefId?: number | null
  userId?: number | null
  wxUserId?: number | null
  outTradeNo?: string | null
  amount?: number | null
  source: 'stripe' | 'wechat'
}): Promise<MembershipSubscription | null> {
  if (order.bizType !== 'membership' || !order.bizRefId) return null
  const identity: MemberIdentity | null = order.userId
    ? { userId: order.userId }
    : (order.wxUserId ? { wxUserId: order.wxUserId } : null)
  if (!identity) {
    console.error('[membership] paid order has no payer identity | order:', order.outTradeNo)
    return null
  }
  try {
    return await activateMembership({
      ...identity,
      planId: order.bizRefId,
      source: order.source,
      outTradeNo: order.outTradeNo ?? null,
      amountCents: order.amount ?? null
    })
  } catch (e) {
    console.error('[membership] fulfilment failed | order:', order.outTradeNo, e)
    return null
  }
}

/** Format a membership order description for payment providers. */
export function membershipOrderDescription(plan: MembershipPlan): string {
  return `Membership: ${plan.nameEn} (${plan.durationDays} days)`
}

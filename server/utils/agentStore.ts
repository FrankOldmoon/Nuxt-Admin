import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../database'
import {
  agentApprovals,
  agentArtifacts,
  agentConversations,
  agentDrafts,
  agentExecutions,
  agentMessages,
  agentToolCalls
} from '../database/schema'
import {
  approvalArgumentsHash,
  assertApprovalTransition,
  type ApprovalCall,
  type ApprovalStatus
} from '../core/agentApproval'
import { AGENT_DRAFT_TTL_MS } from '../core/conversation'
import type { ModelUsage } from '../core/modelGateway'

export interface AgentRecordActor {
  userId: number
  tenantId?: number | null
  organizationId?: number | null
}

export interface StartExecutionInput extends AgentRecordActor {
  agentId?: string
  sessionId?: string | null
  taskId?: string | null
  modelId?: string | null
  providerId?: string | null
  metadata?: Record<string, unknown>
}

/** Create a running execution row and return its ID. */
export async function startAgentExecution(input: StartExecutionInput): Promise<number> {
  const [row] = await db.insert(agentExecutions).values({
    agentId: input.agentId ?? 'agent',
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    organizationId: input.organizationId ?? null,
    sessionId: input.sessionId ?? null,
    taskId: input.taskId ?? null,
    modelId: input.modelId ?? null,
    providerId: input.providerId ?? null,
    status: 'running',
    metadata: input.metadata ?? null
  }).returning({ id: agentExecutions.id })
  if (!row) throw createError({ statusCode: 500, message: 'Failed to create agent execution record' })
  return row.id
}

export interface FinishExecutionInput {
  status: 'running' | 'pending_approval' | 'completed' | 'failed' | 'cancelled'
  usage?: ModelUsage
  costUsd?: number
  error?: string
  modelId?: string | null
  providerId?: string | null
}

/** Update the final status, token usage and cost of an execution. */
export async function finishAgentExecution(executionId: number, input: FinishExecutionInput): Promise<void> {
  const usage = input.usage
  await db.update(agentExecutions).set({
    status: input.status,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    costUsd: input.costUsd ?? null,
    error: input.error ?? null,
    ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
    completedAt: input.status === 'running' ? null : new Date()
  }).where(eq(agentExecutions.id, executionId))
}

/** Load one execution (used to resume a persisted approval batch). */
export async function findAgentExecution(executionId: number) {
  const [row] = await db.select().from(agentExecutions).where(eq(agentExecutions.id, executionId)).limit(1)
  return row ?? null
}

/** Merge metadata (e.g. the suspended resume context) into an execution. */
export async function updateAgentExecutionMetadata(
  executionId: number,
  metadata: Record<string, unknown>
): Promise<void> {
  await db.update(agentExecutions)
    .set({ metadata })
    .where(eq(agentExecutions.id, executionId))
}

export interface RecordToolCallInput {
  executionId: number
  moduleId?: string | null
  toolId: string
  callId: string
  status: 'success' | 'failure' | 'denied'
  riskLevel?: string | null
  args?: unknown
  resultSize?: number | null
  durationMs?: number | null
  error?: string | null
}

/** Persist one tool invocation (success, failure or denial). */
export async function recordAgentToolCall(input: RecordToolCallInput): Promise<void> {
  await db.insert(agentToolCalls).values({
    executionId: input.executionId,
    moduleId: input.moduleId ?? null,
    toolId: input.toolId,
    callId: input.callId,
    status: input.status,
    riskLevel: input.riskLevel ?? null,
    arguments: input.args ?? null,
    resultSize: input.resultSize ?? null,
    durationMs: input.durationMs ?? null,
    error: input.error ?? null,
    completedAt: new Date()
  })
}

export interface CreateApprovalInput extends AgentRecordActor {
  batchId: string
  executionId: number
  calls: readonly ApprovalCall[]
  ttlMs?: number
}

/**
 * Persist a pending approval bound to the exact ordered calls + arguments.
 * Returns the stored hash so the caller can prove the binding.
 */
export async function createAgentApproval(input: CreateApprovalInput) {
  const hash = approvalArgumentsHash(input.calls)
  const [row] = await db.insert(agentApprovals).values({
    batchId: input.batchId,
    executionId: input.executionId,
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    organizationId: input.organizationId ?? null,
    calls: input.calls as unknown as Record<string, unknown>,
    argumentsHash: hash,
    status: 'pending',
    expiresAt: new Date(Date.now() + (input.ttlMs ?? 10 * 60 * 1000))
  }).returning()
  if (!row) throw createError({ statusCode: 500, message: 'Failed to create agent approval' })
  return row
}

export async function findAgentApproval(batchId: string) {
  const [row] = await db.select().from(agentApprovals).where(eq(agentApprovals.batchId, batchId)).limit(1)
  return row ?? null
}

export async function listAgentApprovals(actor: AgentRecordActor, status?: ApprovalStatus) {
  const clauses = [eq(agentApprovals.userId, actor.userId)]
  if (status) clauses.push(eq(agentApprovals.status, status))
  return await db.select().from(agentApprovals)
    .where(and(...clauses))
    .orderBy(desc(agentApprovals.createdAt))
}

export async function markAgentApprovalStatus(batchId: string, status: ApprovalStatus): Promise<void> {
  await db.update(agentApprovals)
    .set({ status, updatedAt: new Date() })
    .where(eq(agentApprovals.batchId, batchId))
}

export interface DecideApprovalInput {
  batchId: string
  approved: boolean
  actor: AgentRecordActor
}

/**
 * Load and decide a pending approval. The owner, tenant and organization must
 * match; expired approvals are transitioned to `expired` and rejected.
 */
export async function decideAgentApproval(input: DecideApprovalInput) {
  const row = await findAgentApproval(input.batchId)
  if (!row || row.userId !== input.actor.userId) {
    throw createError({ statusCode: 404, message: 'Pending approval not found or expired' })
  }
  if (input.actor.organizationId && row.organizationId && row.organizationId !== input.actor.organizationId) {
    throw createError({ statusCode: 404, message: 'Pending approval not found or expired' })
  }
  if (row.status !== 'pending') {
    throw createError({ statusCode: 409, message: `Approval is already ${row.status}` })
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await markAgentApprovalStatus(input.batchId, 'expired')
    throw createError({ statusCode: 410, message: 'Approval has expired' })
  }

  const next: ApprovalStatus = input.approved ? 'approved' : 'rejected'
  assertApprovalTransition('pending', next)
  const calls = row.calls as unknown as ApprovalCall[]
  if (approvalArgumentsHash(calls) !== row.argumentsHash) {
    throw createError({ statusCode: 409, message: 'Approval arguments no longer match; a new approval is required' })
  }

  const [updated] = await db.update(agentApprovals).set({
    status: next,
    decidedBy: input.actor.userId,
    decidedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(agentApprovals.batchId, input.batchId)).returning()
  return updated ?? row
}

/** Expire every pending approval whose TTL has passed. */
export async function expireStaleApprovals(now: Date = new Date()): Promise<number> {
  const pending = await db.select({ batchId: agentApprovals.batchId, expiresAt: agentApprovals.expiresAt })
    .from(agentApprovals)
    .where(eq(agentApprovals.status, 'pending'))
  const stale = pending.filter(row => row.expiresAt && row.expiresAt.getTime() < now.getTime())
  for (const row of stale) {
    await markAgentApprovalStatus(row.batchId, 'expired')
  }
  return stale.length
}

export interface AttachArtifactInput {
  executionId: number
  fileId: number
  kind?: string | null
  ttlMs?: number | null
}

/** Link an agent-generated file (created via the Core file service). */
export async function attachAgentArtifact(input: AttachArtifactInput) {
  const [row] = await db.insert(agentArtifacts).values({
    executionId: input.executionId,
    fileId: input.fileId,
    kind: input.kind ?? null,
    expiresAt: input.ttlMs ? new Date(Date.now() + input.ttlMs) : null
  }).onConflictDoNothing().returning()
  return row ?? null
}

export async function listAgentArtifacts(executionId: number) {
  return await db.select().from(agentArtifacts)
    .where(eq(agentArtifacts.executionId, executionId))
    .orderBy(desc(agentArtifacts.createdAt))
}

// ---------------------------------------------------------------------------
// Conversations / messages / drafts (chat workbench)
// ---------------------------------------------------------------------------

export interface ConversationActor {
  userId: number
  organizationId?: number | null
  tenantId?: number | null
}

export interface CreateConversationInput extends ConversationActor {
  title?: string | null
}

export async function createAgentConversation(input: CreateConversationInput) {
  const [row] = await db.insert(agentConversations).values({
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    organizationId: input.organizationId ?? null,
    title: input.title?.trim() || '新对话'
  }).returning()
  if (!row) throw createError({ statusCode: 500, message: 'Failed to create conversation' })
  return row
}

export async function listAgentConversations(actor: ConversationActor, limit = 50) {
  return await db.select().from(agentConversations)
    .where(and(
      eq(agentConversations.userId, actor.userId),
      eq(agentConversations.status, 'active')
    ))
    .orderBy(desc(agentConversations.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 200))
}

/**
 * Load a conversation owned by the actor. Organization mismatches return
 * `null` (mapped to 404 by the API) instead of leaking existence.
 */
export async function findAgentConversation(conversationId: number, actor: ConversationActor) {
  const [row] = await db.select().from(agentConversations)
    .where(and(
      eq(agentConversations.id, conversationId),
      eq(agentConversations.userId, actor.userId)
    ))
    .limit(1)
  if (!row) return null
  if (actor.organizationId && row.organizationId && row.organizationId !== actor.organizationId) return null
  return row
}

export async function touchAgentConversation(conversationId: number): Promise<void> {
  await db.update(agentConversations)
    .set({ updatedAt: new Date() })
    .where(eq(agentConversations.id, conversationId))
}

export async function renameAgentConversation(conversationId: number, actor: ConversationActor, title: string) {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!clean) throw createError({ statusCode: 400, message: 'title is required' })
  const [row] = await db.update(agentConversations)
    .set({ title: clean, updatedAt: new Date() })
    .where(and(
      eq(agentConversations.id, conversationId),
      eq(agentConversations.userId, actor.userId)
    ))
    .returning()
  return row ?? null
}

/** Soft-delete: archived conversations disappear from lists but keep audit data. */
export async function archiveAgentConversation(conversationId: number, actor: ConversationActor): Promise<boolean> {
  const [row] = await db.update(agentConversations)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(
      eq(agentConversations.id, conversationId),
      eq(agentConversations.userId, actor.userId)
    ))
    .returning({ id: agentConversations.id })
  return !!row
}

export interface AddMessageInput {
  conversationId: number
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: unknown
  ui?: unknown
  executionId?: number | null
}

export async function addAgentMessage(input: AddMessageInput) {
  const [row] = await db.insert(agentMessages).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    toolCalls: input.toolCalls ?? null,
    ui: input.ui ?? null,
    executionId: input.executionId ?? null
  }).returning()
  if (!row) throw createError({ statusCode: 500, message: 'Failed to store message' })
  await touchAgentConversation(input.conversationId)
  return row
}

export async function listAgentMessages(conversationId: number, limit = 200) {
  return await db.select().from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(asc(agentMessages.createdAt), asc(agentMessages.id))
    .limit(Math.min(Math.max(limit, 1), 500))
}

export interface CreateDraftInput extends ConversationActor {
  conversationId: number
  capabilityId: string
  payload: unknown
}

export async function createAgentDraft(input: CreateDraftInput) {
  const [row] = await db.insert(agentDrafts).values({
    conversationId: input.conversationId,
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    tenantId: input.tenantId ?? null,
    capabilityId: input.capabilityId,
    payload: input.payload ?? {},
    expiresAt: new Date(Date.now() + AGENT_DRAFT_TTL_MS)
  }).returning()
  if (!row) throw createError({ statusCode: 500, message: 'Failed to create draft' })
  return row
}

export async function findAgentDraft(draftId: number) {
  const [row] = await db.select().from(agentDrafts)
    .where(eq(agentDrafts.id, draftId))
    .limit(1)
  return row ?? null
}

/**
 * Atomically claim a draft for submission. Only the first caller wins; later
 * submissions see `null` and map to 409, which is the idempotency guarantee.
 */
export async function claimAgentDraftForSubmit(draftId: number, actor: ConversationActor) {
  const [row] = await db.update(agentDrafts)
    .set({ status: 'submitted', updatedAt: new Date() })
    .where(and(
      eq(agentDrafts.id, draftId),
      eq(agentDrafts.userId, actor.userId),
      eq(agentDrafts.status, 'draft'),
      or(isNull(agentDrafts.expiresAt), gt(agentDrafts.expiresAt, new Date()))
    ))
    .returning()
  return row ?? null
}

/** Restore a claimed draft when execution failed before any business write. */
export async function restoreAgentDraft(draftId: number): Promise<void> {
  await db.update(agentDrafts)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(and(eq(agentDrafts.id, draftId), eq(agentDrafts.status, 'submitted')))
}

/** Close an expired draft so it can never be executed later. */
export async function expireAgentDraft(draftId: number): Promise<void> {
  await db.update(agentDrafts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(agentDrafts.id, draftId), eq(agentDrafts.status, 'draft')))
}

export async function attachDraftExecution(draftId: number, executionId: number): Promise<void> {
  await db.update(agentDrafts)
    .set({ executionId, updatedAt: new Date() })
    .where(eq(agentDrafts.id, draftId))
}

export async function cancelAgentDraft(draftId: number, actor: ConversationActor): Promise<boolean> {
  const [row] = await db.update(agentDrafts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(
      eq(agentDrafts.id, draftId),
      eq(agentDrafts.userId, actor.userId),
      eq(agentDrafts.status, 'draft')
    ))
    .returning({ id: agentDrafts.id })
  return !!row
}

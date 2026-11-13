import { and, desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../database'
import {
  agentApprovals,
  agentArtifacts,
  agentExecutions,
  agentToolCalls
} from '../database/schema'
import {
  approvalArgumentsHash,
  assertApprovalTransition,
  type ApprovalCall,
  type ApprovalStatus
} from '../core/agentApproval'
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

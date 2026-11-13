import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, pool } from '../../../server/database'
import { agentApprovals, agentArtifacts, agentExecutions, agentToolCalls } from '../../../server/database/schema'
import { approvalArgumentsHash } from '../../../server/core/agentApproval'
import {
  attachAgentArtifact,
  createAgentApproval,
  decideAgentApproval,
  findAgentApproval,
  findAgentExecution,
  finishAgentExecution,
  listAgentArtifacts,
  recordAgentToolCall,
  startAgentExecution
} from '../../../server/utils/agentStore'

describe('agent execution records (database)', () => {
  const userId = 9_100_000 + Math.floor(Math.random() * 100_000)
  const organizationId = 9_200_000 + Math.floor(Math.random() * 100_000)
  const executionIds: number[] = []
  const batchIds: string[] = []

  beforeAll(async () => {
    // The shared test database may predate the agent tables; bootstrap them
    // idempotently (mirrors migrations/0013_orange_gorgon.sql).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_executions (
        id serial PRIMARY KEY,
        agent_id varchar(80) DEFAULT 'agent' NOT NULL,
        user_id integer NOT NULL,
        tenant_id integer,
        organization_id integer,
        session_id varchar(120),
        task_id varchar(120),
        model_id varchar(120),
        provider_id varchar(80),
        status varchar(30) DEFAULT 'running' NOT NULL,
        prompt_tokens integer,
        completion_tokens integer,
        total_tokens integer,
        cost_usd double precision,
        error text,
        metadata jsonb,
        started_at timestamptz DEFAULT now() NOT NULL,
        completed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS agent_tool_calls (
        id serial PRIMARY KEY,
        execution_id integer NOT NULL,
        module_id varchar(80),
        tool_id varchar(160) NOT NULL,
        call_id varchar(160) NOT NULL,
        status varchar(20) NOT NULL,
        risk_level varchar(20),
        arguments jsonb,
        result_size integer,
        duration_ms integer,
        error text,
        started_at timestamptz DEFAULT now() NOT NULL,
        completed_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS agent_approvals (
        id serial PRIMARY KEY,
        batch_id varchar(64) NOT NULL,
        execution_id integer NOT NULL,
        user_id integer NOT NULL,
        tenant_id integer,
        organization_id integer,
        calls jsonb NOT NULL,
        arguments_hash varchar(64) NOT NULL,
        status varchar(20) DEFAULT 'pending' NOT NULL,
        expires_at timestamptz,
        decided_by integer,
        decided_at timestamptz,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_artifacts (
        id serial PRIMARY KEY,
        execution_id integer NOT NULL,
        file_id integer NOT NULL,
        kind varchar(40),
        expires_at timestamptz,
        created_at timestamptz DEFAULT now() NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agent_approvals_batch_idx ON agent_approvals (batch_id);
      CREATE INDEX IF NOT EXISTS agent_approvals_user_status_idx ON agent_approvals (user_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS agent_artifacts_execution_file_idx ON agent_artifacts (execution_id, file_id);
      CREATE INDEX IF NOT EXISTS agent_artifacts_execution_idx ON agent_artifacts (execution_id);
      CREATE INDEX IF NOT EXISTS agent_executions_user_started_idx ON agent_executions (user_id, started_at);
      CREATE INDEX IF NOT EXISTS agent_executions_org_started_idx ON agent_executions (organization_id, started_at);
      CREATE INDEX IF NOT EXISTS agent_executions_status_idx ON agent_executions (status);
      CREATE INDEX IF NOT EXISTS agent_tool_calls_execution_idx ON agent_tool_calls (execution_id);
      CREATE INDEX IF NOT EXISTS agent_tool_calls_tool_idx ON agent_tool_calls (tool_id);
    `)
  })

  async function start(): Promise<number> {
    const id = await startAgentExecution({
      userId,
      tenantId: 1,
      organizationId,
      sessionId: 'session-1',
      taskId: 'task-1',
      modelId: 'gpt-test',
      metadata: { test: true }
    })
    executionIds.push(id)
    return id
  }

  afterAll(async () => {
    for (const id of executionIds) {
      await db.delete(agentToolCalls).where(eq(agentToolCalls.executionId, id))
      await db.delete(agentArtifacts).where(eq(agentArtifacts.executionId, id))
      await db.delete(agentExecutions).where(eq(agentExecutions.id, id))
    }
    for (const batchId of batchIds) {
      await db.delete(agentApprovals).where(eq(agentApprovals.batchId, batchId))
    }
    await pool.end()
  })

  it('persists execution status, usage, cost and tool calls', async () => {
    const executionId = await start()
    await recordAgentToolCall({
      executionId,
      moduleId: 'sis',
      toolId: 'sis.students.search',
      callId: 'call-1',
      status: 'success',
      riskLevel: 'low',
      args: { query: 'alice' },
      resultSize: 120,
      durationMs: 8
    })
    await finishAgentExecution(executionId, {
      status: 'completed',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      costUsd: 0.0012,
      providerId: 'openai-compatible'
    })

    const execution = await findAgentExecution(executionId)
    expect(execution).toMatchObject({
      status: 'completed',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      providerId: 'openai-compatible'
    })
    expect(execution?.costUsd).toBeCloseTo(0.0012)

    const calls = await db.select().from(agentToolCalls).where(eq(agentToolCalls.executionId, executionId))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      toolId: 'sis.students.search',
      moduleId: 'sis',
      riskLevel: 'low',
      status: 'success'
    })
  })

  it('binds approval to the exact calls and enforces ownership', async () => {
    const executionId = await start()
    const batchId = `batch-${executionId}-ok`
    batchIds.push(batchId)
    const calls = [
      { callId: 'c1', toolId: 'sis.students.create', arguments: { name: 'A', classId: 1 } },
      { callId: 'c2', toolId: 'sis.enrollments.create', arguments: { studentId: 1, classId: 1 } }
    ]
    const approval = await createAgentApproval({
      batchId,
      executionId,
      userId,
      tenantId: 1,
      organizationId,
      calls
    })
    expect(approval.argumentsHash).toBe(approvalArgumentsHash(calls))

    await expect(decideAgentApproval({ batchId, approved: true, actor: { userId: userId + 1 } }))
      .rejects.toMatchObject({ statusCode: 404 })

    const decided = await decideAgentApproval({
      batchId,
      approved: true,
      actor: { userId, organizationId }
    })
    expect(decided.status).toBe('approved')
    await expect(decideAgentApproval({ batchId, approved: false, actor: { userId, organizationId } }))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects expired approvals and detects a tampered binding', async () => {
    const executionId = await start()

    const expiredBatch = `batch-${executionId}-expired`
    batchIds.push(expiredBatch)
    await createAgentApproval({
      batchId: expiredBatch,
      executionId,
      userId,
      calls: [{ callId: 'c1', toolId: 'x', arguments: {} }],
      ttlMs: -1000
    })
    await expect(decideAgentApproval({ batchId: expiredBatch, approved: true, actor: { userId } }))
      .rejects.toMatchObject({ statusCode: 410 })
    expect((await findAgentApproval(expiredBatch))?.status).toBe('expired')

    const tamperedBatch = `batch-${executionId}-tampered`
    batchIds.push(tamperedBatch)
    await createAgentApproval({
      batchId: tamperedBatch,
      executionId,
      userId,
      calls: [{ callId: 'c1', toolId: 'x', arguments: { a: 1 } }]
    })
    await db.update(agentApprovals)
      .set({ argumentsHash: 'deadbeef' })
      .where(eq(agentApprovals.batchId, tamperedBatch))
    await expect(decideAgentApproval({ batchId: tamperedBatch, approved: true, actor: { userId } }))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('links file artifacts to an execution', async () => {
    const executionId = await start()
    const first = await attachAgentArtifact({ executionId, fileId: 42, kind: 'report' })
    expect(first?.executionId).toBe(executionId)
    // Idempotent attach: duplicate (execution, file) is ignored.
    expect(await attachAgentArtifact({ executionId, fileId: 42, kind: 'report' })).toBeNull()

    const artifacts = await listAgentArtifacts(executionId)
    expect(artifacts.map(row => row.fileId)).toEqual([42])
  })
})

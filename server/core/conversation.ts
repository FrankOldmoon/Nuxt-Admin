/**
 * Conversation domain types shared by the agent APIs and the chat client.
 * Stored payloads are plain JSON (jsonb); the helpers here keep the wire and
 * persistence shapes in one place.
 */
import type { FormDescriptor, PreviewResult } from './capability'

export type ConversationStatus = 'active' | 'archived'
export type ConversationMessageRole = 'user' | 'assistant' | 'system'
export type DraftStatus = 'draft' | 'submitted' | 'cancelled'

/** Chat form drafts expire so an old confirmation cannot be replayed later. */
export const AGENT_DRAFT_TTL_MS = 30 * 60 * 1000

const DRAFT_TRANSITIONS: Record<DraftStatus, readonly DraftStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: [],
  cancelled: []
}

export function canTransitionDraft(from: DraftStatus, to: DraftStatus): boolean {
  return DRAFT_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertDraftTransition(from: DraftStatus, to: DraftStatus): void {
  if (!canTransitionDraft(from, to)) {
    throw new Error(`Invalid draft transition: ${from} -> ${to}`)
  }
}

/** First 60 characters of the first user message become the conversation title. */
export function conversationTitleFrom(message: string | null | undefined, fallback = '新对话'): string {
  const clean = (message ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return fallback
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean
}

export interface ToolCallCard {
  id: string
  name: string
  title: string
  status: 'success' | 'failure' | 'denied'
  summary?: string
  arguments?: unknown
  error?: string
  durationMs?: number
}

/** Chat-rendered UI directives. The client never invents fields. */
export interface ChatFormUi {
  kind: 'form'
  capabilityId: string
  title: string
  draftId: number
  form: FormDescriptor
  /** Values the model proposed; the form starts from these. */
  initial?: Record<string, unknown>
  preview?: Pick<PreviewResult, 'summary' | 'details' | 'impact' | 'warnings'>
}

export interface ChatApprovalCall {
  id: string
  name: string
  title?: string
  riskLevel?: 'low' | 'medium' | 'high'
}

export interface ChatApprovalUi {
  kind: 'approval'
  batchId: string
  calls: ChatApprovalCall[]
}

export interface ChatResultUi {
  kind: 'result'
  capabilityId: string
  title: string
  summary: string
}

export interface ChatToolsUi {
  kind: 'tools'
  cards: ToolCallCard[]
}

export type ChatUi = ChatFormUi | ChatApprovalUi | ChatResultUi | ChatToolsUi

export type ChatStatus = 'completed' | 'pending_confirmation' | 'pending_form' | 'failed'

export interface ChatResponse {
  conversationId: number
  status: ChatStatus
  message: { role: 'assistant', content: string }
  toolCalls: ToolCallCard[]
  pendingApproval?: { batchId: string, calls: ChatApprovalCall[] }
  ui?: ChatUi
  error?: string
}

export interface StoredMessage {
  id: number
  role: ConversationMessageRole
  content: string
  toolCalls: ToolCallCard[] | null
  ui: ChatUi | null
  executionId: number | null
  createdAt: string
}

export interface ConversationSummary {
  id: number
  title: string
  status: ConversationStatus
  createdAt: string
  updatedAt: string
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[]
}

export function isChatUi(value: unknown): value is ChatUi {
  if (!value || typeof value !== 'object') return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'form' || kind === 'approval' || kind === 'result' || kind === 'tools'
}

export function asChatUi(value: unknown): ChatUi | null {
  return isChatUi(value) ? value : null
}

export function asToolCallCards(value: unknown): ToolCallCard[] | null {
  return Array.isArray(value) ? value as ToolCallCard[] : null
}

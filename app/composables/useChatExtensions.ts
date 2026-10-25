/**
 * Extension points for the chat widget.
 *
 * The base app owns the chat shell and the ```tool / ```ui protocol, but it
 * must not know which feature modules are mounted. Modules fill the registries
 * below at startup (from an app plugin):
 *
 *  - UI cards: the model may reference an id, the base renders the component
 *    the module registered for it
 *  - auto tools: browser-side implementations the model may invoke
 *  - seed handlers: hand attachments to a card the module renders
 *  - billing: let a module charge before an auto tool runs
 *
 * Rule of thumb: base imports nothing from `modules/`; modules may import base.
 */

/** Catalog version discriminator used by the UI cards (`cn` / `global`). */
export type ChatRegion = string

/** One card the model may point at with a ```ui block. */
export interface ChatUiCard {
  kind: 'component'
  /** Component tag; modules register it as a global component. */
  target: string
  /** Tool id resolved by the registered component (optional). */
  toolId?: string
  /** Where "open in a new tab" should point; supplied by the owning module. */
  href?: string
  title: { en: string, zh: string }
  note: { en: string, zh: string }
  /** Regions where the card may be offered; absent = everywhere. */
  regions?: ChatRegion[]
}

export type ChatToolFileKind = 'pdf' | 'image' | 'sheet' | 'any'

export interface ChatToolRunResult {
  blobs: Array<{ blob: Blob, name: string }>
  note?: string
}

/** One browser-side tool the model may invoke with JSON args. */
export interface ChatToolEntry {
  name: string
  description: string
  argsHelp: string
  /** Card id shown next to the result (same id space as the UI cards). */
  ui: string
  /** Which attachments the tool accepts; used to pick a target file. */
  kind: ChatToolFileKind
  /** Tools such as merge/zip consume every attachment instead of one. */
  many?: boolean
  /** Accepted for compatibility but not advertised in the prompt (aliases). */
  hidden?: boolean
  run: (files: File[], args: Record<string, unknown>) => Promise<ChatToolRunResult>
}

export interface ChatCardSeedPayload {
  cardId: string
  toolId?: string
  files: File[]
  args: Record<string, unknown>
}

export interface ChatToolChargeResult {
  ok: boolean
  error?: string
  transactionId?: number | null
}

/**
 * Optional metering hook. A module that charges per use registers one; the base
 * calls it right before an auto tool runs and refunds when the run fails.
 */
export interface ChatToolBillingHandler {
  charge: (entry: ChatToolEntry) => Promise<ChatToolChargeResult>
  refund?: (transactionId: number) => Promise<void>
}

/**
 * Optional catalog hook. A module that serves a regional / permission-filtered
 * catalog registers one, so the base can drop cards the viewer cannot open
 * without knowing the module's endpoints.
 */
export interface ChatCatalogProvider {
  /** Active deployment version (e.g. `cn` / `global`). */
  region?: () => Promise<string | undefined>
  /** Ids the current viewer may open; undefined = no filtering. */
  allowedToolIds?: () => Promise<Set<string> | undefined>
}

const uiCards = new Map<string, ChatUiCard>()
const toolEntries = new Map<string, ChatToolEntry>()
const seedHandlers = new Map<string, (payload: ChatCardSeedPayload) => void>()
let billing: ChatToolBillingHandler | null = null
let catalog: ChatCatalogProvider | null = null

/** Register (or replace) UI cards. Ids are the closed set the model may use. */
export function registerChatUiCards(cards: Iterable<readonly [string, ChatUiCard]>): void {
  for (const [id, card] of cards) uiCards.set(id, card)
}

export function getChatUiCards(): Record<string, ChatUiCard> {
  return Object.fromEntries(uiCards)
}

/** Register (or replace) browser-side auto tools by name. */
export function registerChatTools(entries: ChatToolEntry[]): void {
  for (const entry of entries) toolEntries.set(entry.name, entry)
}

export function getChatTools(): ChatToolEntry[] {
  return [...toolEntries.values()]
}

export function findChatTool(name: string): ChatToolEntry | undefined {
  return toolEntries.get(name)
}

/** A module hands its attachments to the card it renders (chat → tool runner). */
export function registerChatCardSeed(target: string, handler: (payload: ChatCardSeedPayload) => void): void {
  seedHandlers.set(target, handler)
}

/** Returns true when a module consumed the seed. */
export function applyChatCardSeed(target: string, payload: ChatCardSeedPayload): boolean {
  const handler = seedHandlers.get(target)
  if (!handler) return false
  handler(payload)
  return true
}

export function registerChatToolBilling(handler: ChatToolBillingHandler): void {
  billing = handler
}

export async function chargeChatTool(entry: ChatToolEntry): Promise<ChatToolChargeResult> {
  if (!billing) return { ok: true }
  try {
    return await billing.charge(entry)
  } catch {
    return { ok: true }
  }
}

export async function refundChatTool(transactionId: number | null | undefined): Promise<void> {
  if (!billing?.refund || !transactionId) return
  try {
    await billing.refund(transactionId)
  } catch {
    // Refunds are best-effort; the ledger already has the spend row.
  }
}

export function registerChatCatalogProvider(provider: ChatCatalogProvider): void {
  catalog = provider
}

export function getChatCatalogProvider(): ChatCatalogProvider | null {
  return catalog
}

/** Test helper: drop everything a module registered. */
export function resetChatExtensions(): void {
  uiCards.clear()
  toolEntries.clear()
  seedHandlers.clear()
  billing = null
  catalog = null
}

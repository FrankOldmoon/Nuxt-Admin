<script setup lang="ts">
import type { LlmChatMessage } from '~/composables/useLlmChat'
import type { ChatAttachment, ToolCallOutput } from '~/composables/useChatTools'
import { buildAttachmentNote, buildChatSystemPrompt, executeToolCall, parseToolReply } from '~/composables/useChatTools'
import type { ChatUiInstance } from '~/composables/useChatUi'
import { chatUiRegistry, buildUiSystemPrompt, parseUiReply } from '~/composables/useChatUi'
import { seedTool } from '../../../modules/tools/app/composables/useToolSeed'

/**
 * Floating AI chat widget (bottom-right).
 *
 * Built with the Nuxt UI chat components (UChatMessages / UChatMessage /
 * UChatPrompt / UChatPromptSubmit) and powered by the project's existing
 * LLM backend (`useLlmChat` → WebSocket streaming with HTTP fallback).
 *
 * Client-side tool calling (plan B): the model may end a reply with a
 * ```tool JSON block "pointing at" a registered tool (see useChatTools).
 * This widget parses the block, executes the tool in the browser on the
 * attached files, renders the produced files as download cards, and feeds
 * the result back to the model for a short confirmation.
 */
interface ChatPart {
  type: 'text'
  text: string
}

interface PaperMatch {
  series: string
  title: string
  label: 'Question Paper' | 'Mark Scheme'
  file: string
}

interface PaperCourseRef {
  key: string
  title: string
  qualificationName: string
  subjectName: string
  boardName: string
  href: string
}

interface PaperSearchPayload {
  query: string
  year: string | null
  paperType: 'question' | 'mark-scheme' | 'all'
  course: PaperCourseRef | null
  matches: PaperMatch[]
  candidates: PaperCourseRef[]
  availableCourses: PaperCourseRef[]
  availableYears: string[]
}

interface ChatUiMessage {
  id: string
  role: 'user' | 'assistant'
  parts: ChatPart[]
  papers?: PaperMatch[]
  courseHref?: string
  /** Files the user attached to this message (kept in the browser only). */
  attachments?: ChatAttachment[]
  /** Files produced by tool execution, offered as download cards. */
  files?: ToolCallOutput[]
  /** Registered UI card returned by the model (see useChatUi.ts). */
  ui?: ChatUiInstance
}

type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

/** "download the 2024 AQA GCSE Chemistry past paper" and Chinese equivalents. */
const PAST_PAPER_INTENT = /past\s*papers?|pastpapers?|mark\s*scheme|真题|试卷|评分标准/i
/** Only auto-trigger a download when the user explicitly asks for it. */
const DOWNLOAD_INTENT = /download|下载|保存|导出|给我|发我/i

/** Client-side caps for chat attachments (decoding happens in memory). */
const MAX_ATTACH_MB = 50
const MAX_ATTACH_FILES = 5
/** Files the browsers tools can work on; anything else is rejected up front. */
const ATTACH_ACCEPT = 'image/*,application/pdf,.pdf,.csv,.xlsx,.xls,.zip'
const ATTACH_EXT = /\.(pdf|csv|xlsx|xls|zip)$/i

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const { streamLlmChat } = useLlmChat()

const open = ref(false)
const expanded = ref(false)
const input = ref('')
const messages = ref<ChatUiMessage[]>([])
const status = ref<ChatStatus>('ready')
const abortController = ref<AbortController | null>(null)
const pendingFiles = ref<File[]>([])
const attachError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const busy = computed(() => status.value === 'submitted' || status.value === 'streaming')

/**
 * Catalog version of this deployment (`cn` / `global`). Used to hide cards the
 * active version does not serve. Falls back to "no filtering" when the tools
 * module (and therefore the endpoint) is not mounted.
 */
const { data: regionData } = await useAsyncData<{ region: 'cn' | 'global' } | null>(
  'tools:region',
  async () => {
    try {
      return await $fetch<{ region: 'cn' | 'global' }>('/api/tools/region')
    } catch {
      return null
    }
  },
  { default: () => null }
)
const region = computed(() => regionData.value?.region)

let messageSeq = 0

function createMessage(role: ChatUiMessage['role'], text = '', attachments: ChatAttachment[] = []): ChatUiMessage {
  return {
    id: `chat-${Date.now()}-${++messageSeq}`,
    role,
    parts: [{ type: 'text', text }],
    attachments: attachments.length ? attachments : undefined
  }
}

/** Revoke the object URLs of tool-produced files (reset / unmount). */
function revokeOutputUrls() {
  for (const m of messages.value) {
    for (const f of m.files ?? []) URL.revokeObjectURL(f.url)
  }
}

function reset() {
  abortController.value?.abort()
  abortController.value = null
  revokeOutputUrls()
  messages.value = []
  input.value = ''
  pendingFiles.value = []
  attachError.value = ''
  status.value = 'ready'
}

onBeforeUnmount(revokeOutputUrls)

/**
 * One streaming LLM turn. The tool-protocol system prompt is prepended
 * client-side, so no server change is needed for the convention to work.
 */
async function streamInto(
  systemMsg: LlmChatMessage,
  history: LlmChatMessage[],
  assistant: ChatUiMessage,
  controller: AbortController
) {
  let firstChunk = true
  await streamLlmChat([systemMsg, ...history], (delta) => {
    if (firstChunk) {
      firstChunk = false
      status.value = 'streaming'
    }
    assistant.parts[0]!.text += delta
  }, controller.signal)
}

/** Strip the (last) ```ui block from the reply text and attach the card. */
function applyUiBlock(assistant: ChatUiMessage) {
  const parsedUi = parseUiReply(assistant.parts[0]!.text, region.value)
  if (parsedUi) {
    assistant.parts[0]!.text = parsedUi.cleanedText
    assistant.ui = parsedUi.ui
  }
}

async function run(prompt: string, appendUser = true, attachments: ChatAttachment[] = []) {
  if (appendUser) messages.value.push(createMessage('user', prompt, attachments))
  const assistantIndex = messages.value.push(createMessage('assistant')) - 1
  // Read through the reactive array so mutations on `parts[0].text` trigger re-render
  const assistant = messages.value[assistantIndex]!

  const baseHistory: LlmChatMessage[] = messages.value
    .filter(m => m.id !== assistant.id && m.parts[0]?.text)
    .map(m => ({ role: m.role, content: messageText(m) + buildAttachmentNote(m.attachments ?? []) }))
  const systemMsg: LlmChatMessage = {
    role: 'system',
    content: `${buildChatSystemPrompt()}\n\n${buildUiSystemPrompt(isLoggedIn.value, region.value)}`
  }

  status.value = 'submitted'
  const controller = new AbortController()
  abortController.value = controller

  try {
    await streamInto(systemMsg, baseHistory, assistant, controller)
    applyUiBlock(assistant)

    // Tool loop: the model may request up to 3 sequential tool executions.
    for (let i = 0; i < 3; i++) {
      const parsed = parseToolReply(assistant.parts[0]!.text)
      if (!parsed) break

      // Strip the block from the visible text, then run the tool in the browser
      assistant.parts[0]!.text = parsed.cleanedText
      status.value = 'submitted'
      const result = await executeToolCall(parsed.call, attachments)
      const outputs = result.outputs ?? []

      if (outputs.length) assistant.files = [...(assistant.files ?? []), ...outputs]
      // Always offer the matching tool card, preloaded with the same files, so
      // the user can tweak the parameters and re-run without uploading again.
      showToolCard(assistant, result.uiId, attachments, parsed.call.args)

      const produced = outputs.map(item => `"${item.name}" (${formatBytes(item.size)})`).join(', ')
      const resultText = result.ok
        ? `[tool result] ${parsed.call.tool}: success, produced ${produced || 'no files'}${result.note ? ` — ${result.note}` : ''}. Briefly confirm the outcome and mention that the tool card below is preloaded for adjustments.`
        : `[tool result] ${parsed.call.tool}: failed — ${result.error}. Briefly apologize and tell the user the tool card below is preloaded so they can adjust it there.`

      await streamInto(systemMsg, [
        ...baseHistory,
        { role: 'assistant', content: assistant.parts[0]!.text },
        { role: 'user', content: resultText }
      ], assistant, controller)
      applyUiBlock(assistant)
    }

    status.value = 'ready'
  } catch (e: unknown) {
    if (controller.signal.aborted) {
      status.value = 'ready'
      return
    }
    status.value = 'error'
    assistant.parts[0]!.text = extractErrorMessage(e, t('chat.error'))
  } finally {
    if (abortController.value === controller) abortController.value = null
  }
}

function onSubmit() {
  const prompt = input.value.trim()
  if (!prompt || !isLoggedIn.value) return
  if (busy.value) return
  input.value = ''

  const attachments = takePendingAttachments()
  if (PAST_PAPER_INTENT.test(prompt) && !attachments.length) void runPastPaperSearch(prompt)
  else void run(prompt, true, attachments)
}

/** Move the pending files into attachments for the message being sent. */
function takePendingAttachments(): ChatAttachment[] {
  const files = pendingFiles.value
  pendingFiles.value = []
  attachError.value = ''
  return files.map(file => ({ name: file.name, size: file.size, type: file.type, file }))
}

function onPickFile() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const inputEl = e.target as HTMLInputElement
  const picked = [...(inputEl.files ?? [])]
  inputEl.value = ''
  if (!picked.length) return

  const accepted: File[] = []
  for (const file of picked) {
    if (!file.type.startsWith('image/') && !ATTACH_EXT.test(file.name)) {
      attachError.value = t('chat.unsupportedFile', { name: file.name })
      return
    }
    if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
      attachError.value = t('chat.fileTooLarge', { max: MAX_ATTACH_MB })
      return
    }
    accepted.push(file)
  }

  const merged = [...pendingFiles.value, ...accepted].slice(0, MAX_ATTACH_FILES)
  if (pendingFiles.value.length + accepted.length > MAX_ATTACH_FILES) {
    attachError.value = t('chat.tooManyFiles', { max: MAX_ATTACH_FILES })
  } else {
    attachError.value = ''
  }
  pendingFiles.value = merged
}

function removePendingFile(index: number) {
  pendingFiles.value = pendingFiles.value.filter((_, position) => position !== index)
  attachError.value = ''
}

/** Chat runs the tool, then hands the same files (and args) to the tool card. */
function showToolCard(assistant: ChatUiMessage, uiId: string | undefined, attachments: ChatAttachment[], args: Record<string, unknown>) {
  if (!uiId) return
  const descriptor = chatUiRegistry(region.value)[uiId]
  if (!descriptor) return
  if (descriptor.toolId) seedTool(descriptor.toolId, attachments.map(item => item.file), args)
  assistant.ui = { id: uiId, descriptor }
}

function messageText(message: ChatUiMessage): string {
  return message.parts.filter(part => part.type === 'text').map(part => part.text).join('')
}

/** Attachment/download icon that reflects the actual file type. */
function fileIcon(name: string): string {
  if (/\.pdf$/i.test(name)) return 'i-lucide-file-text'
  if (/\.(csv|xlsx|xls)$/i.test(name)) return 'i-lucide-file-spreadsheet'
  if (/\.zip$/i.test(name)) return 'i-lucide-folder-archive'
  if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)) return 'i-lucide-image'
  return 'i-lucide-file'
}

function paperLabel(label: PaperMatch['label']): string {
  return t(label === 'Mark Scheme' ? 'chat.papers.markScheme' : 'chat.papers.questionPaper')
}

/** Same-origin PDF: a single programmatic click is allowed while the send gesture is fresh. */
function triggerDownload(file: string) {
  const link = document.createElement('a')
  link.href = file
  link.download = ''
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Resolve "download the 2024 AQA GCSE Chemistry past paper" against the locally
 * downloaded papers instead of asking the LLM, so the reply contains real files.
 */
async function runPastPaperSearch(prompt: string) {
  messages.value.push(createMessage('user', prompt))
  status.value = 'submitted'

  let data: PaperSearchPayload
  try {
    data = await $fetch<PaperSearchPayload>('/api/aiexam/past-papers/search', { query: { q: prompt } })
  } catch {
    // Module disabled or endpoint unreachable — fall back to a normal LLM reply.
    await run(prompt, false)
    return
  }

  const assistant = createMessage('assistant')
  const lines: string[] = []

  if (data.matches.length) {
    lines.push(t('chat.papers.found', {
      count: data.matches.length,
      course: data.course?.title ?? prompt
    }))
    assistant.papers = data.matches
    assistant.courseHref = data.course?.href
    if (DOWNLOAD_INTENT.test(prompt)) {
      const single = data.matches.length === 1 ? data.matches[0] : undefined
      if (single) {
        triggerDownload(single.file)
        lines.push(t('chat.papers.downloading', { title: single.title }))
      } else {
        lines.push(t('chat.papers.choose'))
      }
    }
  } else if (data.course) {
    lines.push(t('chat.papers.noYear', {
      year: data.year ?? '-',
      course: data.course.title,
      years: data.availableYears.join(' / ') || '-'
    }))
  } else if (data.candidates.length) {
    lines.push(t('chat.papers.candidates'))
    lines.push(...data.candidates.map(course => `• ${course.title}`))
  } else {
    lines.push(t('chat.papers.noCourse', { query: prompt }))
    if (data.availableCourses.length) {
      lines.push('')
      lines.push(t('chat.papers.availableCourses'))
      lines.push(...data.availableCourses.map(course => `• ${course.title}`))
    }
  }

  assistant.parts[0]!.text = lines.join('\n')
  messages.value.push(assistant)
  status.value = 'ready'
}

function onStop() {
  abortController.value?.abort()
}

function onReload() {
  // Drop the failed assistant reply, then retry the last user prompt
  if (messages.value[messages.value.length - 1]?.role === 'assistant') messages.value.pop()
  const lastUser = messages.value[messages.value.length - 1]
  if (!lastUser || lastUser.role !== 'user') {
    status.value = 'ready'
    return
  }
  const prompt = lastUser.parts[0]?.text ?? ''
  messages.value.pop()
  status.value = 'ready'
  if (prompt) void run(prompt)
}
</script>

<template>
  <div class="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3 print:hidden">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 scale-95 opacity-0"
      enter-to-class="translate-y-0 scale-100 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 scale-100 opacity-100"
      leave-to-class="translate-y-2 scale-95 opacity-0"
    >
      <div
        v-if="open"
        role="dialog"
        :aria-label="t('chat.title')"
        class="flex flex-col overflow-hidden rounded-2xl border border-default bg-default shadow-xl"
        :class="expanded
          ? 'fixed inset-2 z-50 h-auto w-auto sm:inset-6'
          : 'h-[min(32rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-3rem))]'"
      >
        <!-- Header -->
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon
            name="i-lucide-bot"
            class="size-5 shrink-0 text-primary"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-highlighted">
              {{ t('chat.title') }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ t('chat.subtitle') }}
            </p>
          </div>
          <UButton
            :icon="expanded ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="expanded ? t('chat.collapse') : t('chat.expand')"
            @click="expanded = !expanded"
          />
          <UButton
            v-if="messages.length"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('chat.clear')"
            @click="reset"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('chat.close')"
            @click="open = false"
          />
        </div>

        <!-- Messages -->
        <div class="min-h-0 flex-1 overflow-y-auto px-1 py-3">
          <div
            v-if="!messages.length"
            class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <UIcon
              name="i-lucide-sparkles"
              class="size-8 text-primary"
            />
            <p class="text-sm font-medium text-highlighted">
              {{ t('chat.welcomeTitle') }}
            </p>
            <p class="text-xs text-muted">
              {{ t('chat.welcomeHint') }}
            </p>
            <p class="text-[11px] text-dimmed">
              {{ t('chat.papers.example') }}
            </p>
          </div>

          <UChatMessages
            v-else
            :messages="messages"
            :status="status"
            :assistant="{ icon: 'i-lucide-bot' }"
            class="pb-2"
          >
            <template #content="{ message }">
              <div
                v-if="message.attachments?.length"
                class="mb-2 flex flex-wrap gap-1.5"
              >
                <span
                  v-for="att in message.attachments"
                  :key="att.name"
                  class="inline-flex items-center gap-1 rounded-md border border-default bg-elevated px-2 py-0.5 text-[11px] text-muted"
                >
                  <UIcon
                    :name="fileIcon(att.name)"
                    class="size-3 shrink-0"
                  />
                  <span class="max-w-40 truncate">{{ att.name }}</span>
                </span>
              </div>
              <div class="whitespace-pre-wrap break-words">
                {{ messageText(message) }}
              </div>
              <ChatUiBlock
                v-if="message.ui"
                :ui="message.ui"
              />
              <div
                v-if="message.files?.length"
                class="mt-2 space-y-1.5"
              >
                <a
                  v-for="file in message.files"
                  :key="file.url"
                  :href="file.url"
                  :download="file.name"
                  class="flex items-center gap-2 rounded-lg border border-default px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <UIcon
                    :name="fileIcon(file.name)"
                    class="size-3.5 shrink-0"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
                  <span class="shrink-0 text-[10px] text-muted">{{ formatBytes(file.size) }}</span>
                </a>
              </div>
              <div
                v-if="message.papers?.length"
                class="mt-2 space-y-1.5"
              >
                <a
                  v-for="paper in message.papers"
                  :key="paper.file"
                  :href="paper.file"
                  download
                  class="flex items-center gap-2 rounded-lg border border-default px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <UIcon
                    name="i-lucide-download"
                    class="size-3.5 shrink-0"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ paper.title }}</span>
                  <span class="shrink-0 text-[10px] text-muted">{{ paperLabel(paper.label) }}</span>
                </a>
                <UButton
                  v-if="message.courseHref"
                  :to="message.courseHref"
                  variant="link"
                  size="xs"
                  trailing-icon="i-lucide-arrow-right"
                  class="px-0"
                >
                  {{ t('chat.papers.openCourse') }}
                </UButton>
              </div>
            </template>
          </UChatMessages>
        </div>

        <!-- Composer -->
        <div class="border-t border-default p-2">
          <UChatPrompt
            v-if="isLoggedIn"
            v-model="input"
            :placeholder="t('chat.placeholder')"
            :rows="1"
            :maxrows="4"
            @submit="onSubmit"
          >
            <template #footer>
              <div class="flex items-center gap-1.5 px-1 py-0.5">
                <input
                  ref="fileInput"
                  type="file"
                  :accept="ATTACH_ACCEPT"
                  multiple
                  class="hidden"
                  @change="onFileChange"
                >
                <UButton
                  icon="i-lucide-paperclip"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="busy"
                  :aria-label="t('chat.attach')"
                  @click="onPickFile"
                />
                <span
                  v-for="(file, index) in pendingFiles"
                  :key="`${file.name}-${index}`"
                  class="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-[11px] text-muted"
                >
                  <UIcon
                    :name="fileIcon(file.name)"
                    class="size-3 shrink-0"
                  />
                  <span class="max-w-32 truncate">{{ file.name }}</span>
                  <button
                    type="button"
                    class="rounded transition-colors hover:text-highlighted"
                    :aria-label="t('chat.removeAttachment')"
                    @click="removePendingFile(index)"
                  >
                    <UIcon
                      name="i-lucide-x"
                      class="size-3"
                    />
                  </button>
                </span>
                <span class="ml-auto text-xs text-muted">{{ t('chat.hint') }}</span>
                <UChatPromptSubmit
                  :status="status"
                  square
                  @stop="onStop"
                  @reload="onReload"
                />
              </div>
              <p
                v-if="attachError"
                class="px-1 text-xs text-error"
              >
                {{ attachError }}
              </p>
            </template>
          </UChatPrompt>

          <!-- Logged out: inline login card (credentials never pass through the LLM) -->
          <ChatLoginCard
            v-else
            class="rounded-xl border border-default"
          />
        </div>
      </div>
    </Transition>

    <!-- Floating trigger -->
    <UButton
      :icon="open ? 'i-lucide-x' : 'i-lucide-message-circle'"
      color="primary"
      size="xl"
      square
      class="rounded-full shadow-lg"
      :aria-label="open ? t('chat.close') : t('chat.open')"
      @click="open = !open"
    />
  </div>
</template>

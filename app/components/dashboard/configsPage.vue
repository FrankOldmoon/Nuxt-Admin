<script setup lang="ts">
/**
 * Configs custom dashboard page — full settings UI with tabs.
 *
 * Rendered at `/dashboard/configs` when the backend registry marks the
 * `configs` table as `custom: true`.  Talks directly to `/api/config/*`.
 */

interface ConfigItem {
  id: number
  key: string
  value: string
  type: string
  description: string | null
  updatedAt: string
}

const { t } = useI18n()
const toast = useToast()

// SSR-friendly initial load
const { data, pending, refresh } = await useAsyncData<ConfigItem[]>(
  'settings:configs',
  async () => {
    const res = await cRequest<{ configs: ConfigItem[] }>('/api/config')
    return res.configs
  },
  { default: () => [] as ConfigItem[] }
)

const configs = computed(() => data.value ?? [])
const editable = ref<Record<string, string>>({})
watchEffect(() => {
  editable.value = Object.fromEntries(configs.value.map(c => [c.key, c.value]))
})

const saving = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// LLM connectivity test
const llmTest = ref<{ loading: boolean, ok: boolean | null, message: string }>({
  loading: false, ok: null, message: ''
})
async function testLlm() {
  llmTest.value = { loading: true, ok: null, message: '' }
  try {
    const res = await cPost<{ ok: boolean, message: string }>('/api/llm/test')
    llmTest.value = { loading: false, ok: !!res?.ok, message: res?.message ?? '' }
  } catch (e) {
    llmTest.value = { loading: false, ok: false, message: extractErrorMessage(e, 'LLM connectivity test failed') }
  }
}

// Group configs by key prefix, with site.title/site.description and blog.enabled ordered first
const generalConfigs = computed(() => {
  const priority = ['site.title', 'site.description', 'blog.enabled']
  const items = configs.value.filter(c =>
    c.key.startsWith('site.')
    || c.key.startsWith('security.')
    || c.key.startsWith('upload.')
    || c.key.startsWith('blog.')
  )
  return [...items].sort((a, b) => {
    const ai = priority.indexOf(a.key)
    const bi = priority.indexOf(b.key)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return 0
  })
})
const mailConfigs = computed(() =>
  configs.value.filter(c => c.key.startsWith('mail.'))
)
const llmConfigs = computed(() =>
  configs.value.filter(c => c.key.startsWith('llm.'))
)

const tabs = computed(() => [
  { label: t('settings.tabGeneral'), icon: 'i-lucide-settings', slot: 'general' },
  { label: t('settings.tabMail'), icon: 'i-lucide-mail', slot: 'mail' },
  { label: t('settings.tabLlm'), icon: 'i-lucide-bot', slot: 'llm' },
  { label: t('settings.tabMenu'), icon: 'i-lucide-menu', slot: 'menu' }
])

// Translate a config key like "site.title" to a friendly label via i18n.
function configLabel(cfg: ConfigItem): string {
  const i18nKey = `settings.config.${cfg.key}`
  const translated = t(i18nKey)
  if (translated && translated !== i18nKey) return translated
  return cfg.description || cfg.key
}

// Coerce a stored string value into a boolean
function boolValue(v: string | undefined): boolean {
  return v === 'true' || v === '1'
}

// Keys ending with .pass / .password should be masked
function isSensitiveKey(key: string): boolean {
  return key.endsWith('.pass') || key.endsWith('.password')
}

function inputType(cfg: ConfigItem): string {
  if (cfg.type === 'number') return 'number'
  if (isSensitiveKey(cfg.key)) return 'password'
  return 'text'
}

async function save() {
  saving.value = true
  errorMsg.value = ''
  successMsg.value = ''
  const changed = configs.value
    .filter(c => String(editable.value[c.key]) !== c.value)
    .map(c => ({ key: c.key, value: String(editable.value[c.key]) }))
  if (changed.length === 0) {
    successMsg.value = t('settings.noChanges')
    saving.value = false
    return
  }
  try {
    const res = await cRequest<{ configs: ConfigItem[] }>('/api/config', {
      method: 'PUT',
      body: { configs: changed }
    })
    data.value = res.configs
    editable.value = Object.fromEntries(res.configs.map(c => [c.key, c.value]))
    successMsg.value = t('settings.saved')
    toast.add({ title: t('settings.saved'), color: 'success' })
    // Refresh public site config so the browser tab title updates immediately
    await refreshNuxtData('config:public').catch(() => {})
  } catch (e: unknown) {
    errorMsg.value = extractErrorMessage(e, t('settings.errors.saveFailed'))
  } finally {
    saving.value = false
  }
}

void refresh
</script>

<template>
  <UContainer class="py-10">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-highlighted">
          {{ t('settings.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t('settings.subtitle') }}
        </p>
      </div>
      <UButton
        icon="i-lucide-save"
        :loading="saving"
        :disabled="pending"
        :label="t('settings.save')"
        @click="save"
      />
    </div>

    <UAlert
      v-if="errorMsg"
      color="error"
      variant="subtle"
      :title="t('auth.errors.title')"
      :description="errorMsg"
      class="mb-4"
    />
    <UAlert
      v-if="successMsg"
      color="success"
      variant="subtle"
      :description="successMsg"
      class="mb-4"
    />

    <div
      v-if="pending"
      class="py-12 text-center text-muted"
    >
      {{ t('settings.loading') }}
    </div>
    <div
      v-else-if="configs.length === 0"
      class="py-12 text-center text-muted"
    >
      {{ t('settings.adminOnly') }}
    </div>
    <UTabs
      v-else
      :items="tabs"
    >
      <template #general>
        <UCard>
          <div class="space-y-4">
            <div
              v-for="cfg in generalConfigs"
              :key="cfg.id"
              class="grid grid-cols-1 gap-2 border-b border-default pb-4 last:border-0 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <div class="text-sm font-medium text-highlighted">
                  {{ configLabel(cfg) }}
                </div>
                <div class="mt-1">
                  <UBadge
                    :label="cfg.type"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                </div>
              </div>
              <div>
                <USwitch
                  v-if="cfg.type === 'boolean'"
                  :model-value="boolValue(editable[cfg.key])"
                  @update:model-value="editable[cfg.key] = String($event)"
                />
                <UInput
                  v-else
                  v-model="editable[cfg.key]"
                  class="w-full"
                  :type="inputType(cfg)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </template>

      <template #mail>
        <UCard>
          <div class="space-y-4">
            <div
              v-for="cfg in mailConfigs"
              :key="cfg.id"
              class="grid grid-cols-1 gap-2 border-b border-default pb-4 last:border-0 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <div class="text-sm font-medium text-highlighted">
                  {{ configLabel(cfg) }}
                </div>
                <div class="mt-1">
                  <UBadge
                    :label="cfg.type"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                </div>
              </div>
              <div>
                <USwitch
                  v-if="cfg.type === 'boolean'"
                  :model-value="boolValue(editable[cfg.key])"
                  @update:model-value="editable[cfg.key] = String($event)"
                />
                <UInput
                  v-else
                  v-model="editable[cfg.key]"
                  class="w-full"
                  :type="inputType(cfg)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </template>

      <template #llm>
        <UCard>
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm text-muted">
              {{ t('settings.llmTestHint') }}
            </p>
            <UButton
              icon="i-lucide-plug-zap"
              color="primary"
              variant="soft"
              size="sm"
              :loading="llmTest.loading"
              :label="t('settings.llmTest')"
              @click="testLlm"
            />
          </div>
          <UAlert
            v-if="llmTest.message"
            :color="llmTest.ok ? 'success' : 'error'"
            variant="subtle"
            :title="llmTest.ok ? t('settings.llmTestOk') : t('settings.llmTestFail')"
            :description="llmTest.message"
            class="mb-4"
          />
          <div class="space-y-4">
            <div
              v-for="cfg in llmConfigs"
              :key="cfg.id"
              class="grid grid-cols-1 gap-2 border-b border-default pb-4 last:border-0 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <div class="text-sm font-medium text-highlighted">
                  {{ configLabel(cfg) }}
                </div>
                <div class="mt-1">
                  <UBadge
                    :label="cfg.type"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                </div>
              </div>
              <div>
                <USwitch
                  v-if="cfg.type === 'boolean'"
                  :model-value="boolValue(editable[cfg.key])"
                  @update:model-value="editable[cfg.key] = String($event)"
                />
                <UTextarea
                  v-else-if="cfg.key === 'llm.systemPrompt'"
                  v-model="editable[cfg.key]"
                  class="w-full"
                  :rows="4"
                />
                <UInput
                  v-else
                  v-model="editable[cfg.key]"
                  class="w-full"
                  :type="inputType(cfg)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </template>

      <template #menu>
        <UCard>
          <DashboardMenuEditor />
        </UCard>
      </template>
    </UTabs>
  </UContainer>
</template>

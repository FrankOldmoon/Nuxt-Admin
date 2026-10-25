<script setup lang="ts">
/**
 * "Install this site" button.
 *
 * Browsers only fire `beforeinstallprompt` when the PWA is installable, so the
 * button simply stays hidden everywhere else. Kept in the base app because
 * installing the shell benefits every module.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const { locale } = useI18n()
const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
const deferred = ref<InstallPromptEvent | null>(null)
const installed = ref(false)

function onPrompt(event: Event) {
  // Chrome shows its own mini-infobar otherwise; we offer the button instead.
  event.preventDefault()
  deferred.value = event as InstallPromptEvent
}

function onInstalled() {
  installed.value = true
  deferred.value = null
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onPrompt)
  window.removeEventListener('appinstalled', onInstalled)
})

async function install() {
  const event = deferred.value
  if (!event) return
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') installed.value = true
  } finally {
    deferred.value = null
  }
}
</script>

<template>
  <UButton
    v-if="deferred && !installed"
    size="sm"
    color="neutral"
    variant="soft"
    icon="i-lucide-monitor-down"
    @click="install"
  >
    {{ isZh ? '安装到桌面' : 'Install app' }}
  </UButton>
</template>

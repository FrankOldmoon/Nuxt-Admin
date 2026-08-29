<script setup lang="ts">
/**
 * ⌘K command palette: global quick navigation (Cmd/Ctrl+K).
 * Enumerates the admin menus + common actions; menu items only show for admins.
 */
const { t } = useI18n()
const { isAdmin } = useAuth()
const { data: metaData } = useDashboardMeta()
const { menuLabel } = useDashboardLabels()

const open = ref(false)

onMounted(() => {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      open.value = !open.value
    }
  }
  window.addEventListener('keydown', onKey)
  onScopeDispose(() => window.removeEventListener('keydown', onKey))
})

interface Cmd { id: string, label: string, icon?: string, onSelect?: () => any }
interface CmdGroup { key: string, id: string, label: string, commands: Cmd[] }

const groups = computed<CmdGroup[]>(() => {
  const g: CmdGroup[] = []
  if (isAdmin.value) {
    const menu = metaData.value?.menu ?? []
    if (menu.length) {
      g.push({
        key: 'tables',
        id: 'tables',
        label: t('dashboard.menu.overview'),
        commands: [
          { id: '/dashboard', label: t('dashboard.menu.overview'), icon: 'i-lucide-layout-dashboard', onSelect: () => navigateTo('/dashboard') },
          ...menu.filter(m => !m.hidden).map(m => ({
            id: m.table,
            label: menuLabel(m),
            icon: m.icon,
            onSelect: () => navigateTo(`/dashboard/${m.table}`)
          }))
        ]
      })
    }
  }
  return g
})
</script>

<template>
  <UModal
    v-if="isAdmin && open"
    v-model:open="open"
    fullscreen
    class="sm:mx-auto sm:max-w-xl sm:top-6"
  >
    <UCommandPalette
      :groups="groups"
      :placeholder="t('common.searchPlaceholder')"
      size="lg"
    />
  </UModal>
</template>
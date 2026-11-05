<script setup lang="ts">
const { t } = useI18n()
const requestUrl = useRequestURL()
const requestHeaders = useRequestHeaders(['host', 'x-forwarded-host'])
const normalizedHost = computed(() => {
  const hostname = (requestHeaders['x-forwarded-host'] || requestHeaders.host || requestUrl.hostname)
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '')
    .toLowerCase()
  return hostname
})
const showWorkbaoIcp = computed(() => {
  const hostname = normalizedHost.value
  return hostname === 'workbao.cn' || hostname === 'www.workbao.cn'
})
</script>

<template>
  <UFooter>
    <template #left>
      <p class="text-sm text-muted">
        {{ t('footer.builtWith') }} • © {{ new Date().getFullYear() }}
      </p>
    </template>
    <a
      v-if="showWorkbaoIcp"
      data-testid="workbao-icp"
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-muted transition-colors hover:text-default"
    >
      粤ICP备2023060418号-3
    </a>
    <template #right>
      <UButton
        to="https://github.com"
        target="_blank"
        icon="i-simple-icons-github"
        aria-label="GitHub"
        color="neutral"
        variant="ghost"
      />
    </template>
  </UFooter>
</template>

<template>
  <main class="mx-auto max-w-3xl p-8">
    <h1 class="text-2xl font-semibold">
      Example Module
    </h1>
    <p class="mt-2 text-gray-600">
      This page is included when the module is enabled at build time.
    </p>
    <p class="mt-4 font-mono text-sm">
      API status: {{ status }}
    </p>
  </main>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/example/health')
const status = computed(() => data.value?.status ?? 'unavailable')
</script>

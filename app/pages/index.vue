<script setup lang="ts">
/**
 * Public landing page ("/").
 *
 * Introduces what this admin demo does: a metadata-driven, enterprise-grade
 * admin framework built on Nuxt.  Readers land here before signing in, so the
 * page highlights the core capabilities, the tech stack, and a call-to-action
 * that leads into the dashboard.
 */
const { t } = useI18n()
const { isLoggedIn } = useAuth()

const features = [
  { icon: 'i-lucide-table-2', key: 'crud' },
  { icon: 'i-lucide-shield-check', key: 'rbac' },
  { icon: 'i-lucide-lock-keyhole', key: 'security' },
  { icon: 'i-lucide-database-zap', key: 'dictionary' },
  { icon: 'i-lucide-bell', key: 'realtime' },
  { icon: 'i-lucide-bot', key: 'llm' },
  { icon: 'i-lucide-languages', key: 'i18n' },
  { icon: 'i-lucide-folder-tree', key: 'structure' }
] as const

const tech = [
  { label: 'Nuxt 4', icon: 'i-simple-icons-nuxtdotjs' },
  { label: 'Nuxt UI', icon: 'i-lucide-shapes' },
  { label: 'Drizzle ORM', icon: 'i-lucide-layers' },
  { label: 'PostgreSQL', icon: 'i-simple-icons-postgresql' },
  { label: 'TypeScript', icon: 'i-simple-icons-typescript' }
] as const
</script>

<template>
  <UContainer class="max-w-6xl">
    <!-- Hero -->
    <section class="py-20 text-center">
      <UBadge color="primary" variant="soft" size="lg">
        {{ t('home.hero.badge') }}
      </UBadge>

      <h1 class="mt-5 text-4xl font-bold text-highlighted sm:text-5xl">
        {{ t('home.hero.title') }}
      </h1>

      <p class="mx-auto mt-4 max-w-2xl text-lg text-muted">
        {{ t('home.hero.subtitle') }}
      </p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <UButton
          icon="i-lucide-rocket"
          size="xl"
          color="primary"
          :to="'/dashboard'"
        >
          {{ isLoggedIn ? t('home.hero.ctaReturn') : t('home.hero.cta') }}
        </UButton>
        <UButton
          icon="i-lucide-file-text"
          size="xl"
          color="neutral"
          variant="soft"
          to="https://github.com/nuxt/nuxt"
          target="_blank"
        >
          {{ t('home.hero.ctaSecondary') }}
        </UButton>
      </div>
    </section>

    <!-- Core capabilities -->
    <section class="pb-16">
      <div class="mb-8 text-center">
        <h2 class="text-2xl font-bold text-highlighted">
          {{ t('home.sectionFeatures') }}
        </h2>
        <p class="mt-1 text-muted">
          {{ t('home.sectionFeaturesHint') }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UCard
          v-for="f in features"
          :key="f.key"
          class="h-full"
        >
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon :name="f.icon" class="h-5 w-5 text-primary" />
              <span class="font-semibold">{{ t(`home.feature.${f.key}.title`) }}</span>
            </div>
          </template>
          <p class="text-sm text-muted">
            {{ t(`home.feature.${f.key}.desc`) }}
          </p>
        </UCard>
      </div>
    </section>

    <!-- Tech stack -->
    <section class="pb-16">
      <div class="mb-8 text-center">
        <h2 class="text-2xl font-bold text-highlighted">
          {{ t('home.sectionTech') }}
        </h2>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3">
        <UBadge
          v-for="s in tech"
          :key="s.label"
          color="neutral"
          variant="subtle"
          size="lg"
          :label="s.label"
          :leading-icon="s.icon"
        />
      </div>
    </section>

    <!-- Call to action -->
    <section class="pb-24">
      <UCard>
        <div class="flex flex-col items-center justify-between gap-4 py-6 text-center sm:flex-row sm:text-left">
          <div>
            <h2 class="text-xl font-bold text-highlighted">
              {{ t('home.cta.title') }}
            </h2>
            <p class="mt-1 text-muted">
              {{ t('home.cta.desc') }}
            </p>
          </div>
          <UButton
            icon="i-lucide-arrow-right"
            size="lg"
            color="primary"
            :to="'/dashboard'"
          >
            {{ isLoggedIn ? t('home.hero.ctaReturn') : t('home.hero.cta') }}
          </UButton>
        </div>
      </UCard>
    </section>
  </UContainer>
</template>
<script setup lang="ts">
/**
 * Public membership / subscription page (`/membership`).
 *
 * Shows the current membership status and the purchasable plans. Clicking a
 * plan creates a Stripe Checkout session via `/api/membership/subscribe` and
 * redirects to the hosted payment page; the membership period is activated by
 * the payment webhook once the charge succeeds.
 */
const { t, locale } = useI18n()
const { isLoggedIn } = useAuth()

interface Plan {
  id: number
  slug: string
  nameEn: string
  nameZh: string
  description: string | null
  durationDays: number
  priceCents: number
  currency: string
  isFeatured: boolean
}

interface MembershipInfo {
  enabled: boolean
  isMember: boolean
  membership: null | {
    planId: number | null
    planName: string | null
    planNameZh: string | null
    status: string
    startsAt: string
    expiresAt: string
    daysLeft: number
    source: string
  }
}

const { data: planData } = await useFetch<{ enabled: boolean, plans: Plan[] }>('/api/membership/plans')
const { data: myMembership, refresh: refreshMembership } = await useAsyncData<MembershipInfo | null>(
  'membership:me',
  () => isLoggedIn.value ? $fetch<MembershipInfo>('/api/membership/me') : Promise.resolve(null),
  { watch: [isLoggedIn] }
)

// Returning from Stripe: sync the order status (webhook fallback) and refresh
const route = useRoute()
const pendingOutTradeNo = computed(() => (route.query.outTradeNo as string | undefined) ?? '')
const syncing = ref(false)
onMounted(async () => {
  if (!pendingOutTradeNo.value) return
  syncing.value = true
  try {
    await $fetch('/api/stripe/pay/order', { query: { outTradeNo: pendingOutTradeNo.value } })
    await refreshMembership()
  } catch (e) {
    console.warn('[membership] order sync failed:', e)
  } finally {
    syncing.value = false
  }
})

const subscribing = ref<number | null>(null)
const errorMessage = ref('')

function planName(plan: Plan): string {
  return locale.value.startsWith('zh') ? plan.nameZh : plan.nameEn
}

function formatPrice(plan: Plan): string {
  const amount = plan.priceCents / 100
  try {
    return new Intl.NumberFormat(locale.value, { style: 'currency', currency: plan.currency.toUpperCase() }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${plan.currency.toUpperCase()}`
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(locale.value)
}

async function subscribe(plan: Plan) {
  if (!isLoggedIn.value) {
    await navigateTo({ path: '/login', query: { redirect: '/membership' } })
    return
  }
  subscribing.value = plan.id
  errorMessage.value = ''
  try {
    const res = await $fetch<{ url: string }>('/api/membership/subscribe', {
      method: 'POST',
      body: { planId: plan.id }
    })
    // Full-page redirect to Stripe Checkout (external URL)
    window.location.href = res.url
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }, message?: string }
    errorMessage.value = err?.data?.message ?? err?.message ?? t('membership.subscribeFailed')
  } finally {
    subscribing.value = null
  }
}
</script>

<template>
  <UContainer class="max-w-5xl py-12">
    <div class="text-center">
      <UBadge
        color="primary"
        variant="soft"
        size="lg"
      >
        {{ t('membership.badge') }}
      </UBadge>
      <h1 class="mt-4 text-3xl font-bold text-highlighted sm:text-4xl">
        {{ t('membership.title') }}
      </h1>
      <p class="mx-auto mt-3 max-w-2xl text-muted">
        {{ t('membership.subtitle') }}
      </p>
    </div>

    <!-- Current membership status -->
    <UCard
      v-if="myMembership?.isMember && myMembership.membership"
      class="mt-10"
    >
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-badge-check"
            class="size-10 text-primary"
          />
          <div>
            <div class="text-lg font-semibold text-highlighted">
              {{ t('membership.activeTitle') }}
            </div>
            <div class="text-sm text-muted">
              <span v-if="myMembership.membership.planName">
                {{ locale.startsWith('zh') ? myMembership.membership.planNameZh : myMembership.membership.planName }}
                ·
              </span>
              {{ t('membership.expiresOn', { date: formatDate(myMembership.membership.expiresAt) }) }}
            </div>
          </div>
        </div>
        <UBadge
          color="success"
          variant="soft"
          size="lg"
        >
          {{ t('membership.daysLeft', { days: myMembership.membership.daysLeft }) }}
        </UBadge>
      </div>
    </UCard>

    <UAlert
      v-else-if="!planData?.enabled"
      class="mt-10"
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      :title="t('membership.disabled')"
    />

    <UAlert
      v-if="errorMessage"
      class="mt-6"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <!-- Plans -->
    <div
      v-if="planData?.enabled"
      class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="plan in planData.plans"
        :key="plan.id"
        :class="plan.isFeatured ? 'ring-2 ring-primary' : ''"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted">
              {{ planName(plan) }}
            </h2>
            <UBadge
              v-if="plan.isFeatured"
              color="primary"
              variant="solid"
              size="sm"
            >
              {{ t('membership.recommended') }}
            </UBadge>
          </div>
          <div class="mt-4 text-3xl font-bold text-highlighted">
            {{ formatPrice(plan) }}
          </div>
          <p class="mt-1 text-sm text-muted">
            {{ t('membership.durationDays', { days: plan.durationDays }) }}
          </p>
          <p
            v-if="plan.description"
            class="mt-3 flex-1 text-sm text-muted"
          >
            {{ plan.description }}
          </p>
          <UButton
            class="mt-6 w-full justify-center"
            color="primary"
            :variant="plan.isFeatured ? 'solid' : 'outline'"
            :loading="subscribing === plan.id"
            :disabled="subscribing !== null || syncing"
            @click="subscribe(plan)"
          >
            {{ myMembership?.isMember ? t('membership.renew') : t('membership.subscribe') }}
          </UButton>
        </div>
      </UCard>
    </div>

    <p class="mt-8 text-center text-xs text-muted">
      {{ t('membership.paymentNote') }}
    </p>
  </UContainer>
</template>

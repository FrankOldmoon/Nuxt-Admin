<script setup lang="ts">
/**
 * Public membership / subscription page (`/membership`).
 *
 * Shows the current membership status and the purchasable plans. Two payment
 * channels are supported and rendered only when enabled in System Config:
 * - Stripe Checkout: creates a session via `/api/membership/subscribe` and
 *   redirects to the hosted payment page.
 * - WeChat Pay Native: creates a Native order and shows its `code_url` as a QR
 *   code; the page polls the order until the payment is confirmed.
 * In both cases the membership period is activated server-side on payment
 * success, never from the browser.
 */
import QRCode from 'qrcode'

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

const { data: planData } = await useFetch<{
  enabled: boolean
  payments: { stripe: boolean, wechat: boolean }
  plans: Plan[]
}>('/api/membership/plans')
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

/** WeChat Pay settles in CNY, so only CNY-priced plans can be paid that way. */
function canPayWithWechat(plan: Plan): boolean {
  return !!planData.value?.payments.wechat && plan.currency.toLowerCase() === 'cny'
}

function canPayWithStripe(): boolean {
  return !!planData.value?.payments.stripe
}

async function requireLogin(): Promise<boolean> {
  if (isLoggedIn.value) return true
  await navigateTo({ path: '/login', query: { redirect: '/membership' } })
  return false
}

async function subscribe(plan: Plan) {
  if (!(await requireLogin())) return
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

// --- WeChat Pay (Native QR code) ---
const wxDialogOpen = ref(false)
const wxQrDataUrl = ref('')
const wxOutTradeNo = ref('')
const wxStatus = ref<'pending' | 'success' | 'closed' | 'error'>('pending')
const wxStarting = ref(false)
let wxPollTimer: ReturnType<typeof setInterval> | null = null

function stopWxPolling() {
  if (wxPollTimer) {
    clearInterval(wxPollTimer)
    wxPollTimer = null
  }
}

async function payWithWechat(plan: Plan) {
  if (!(await requireLogin())) return
  wxStarting.value = true
  errorMessage.value = ''
  wxStatus.value = 'pending'
  wxQrDataUrl.value = ''
  try {
    const res = await $fetch<{ outTradeNo: string, codeUrl: string }>('/api/membership/wechat/order', {
      method: 'POST',
      body: { planId: plan.id }
    })
    wxOutTradeNo.value = res.outTradeNo
    wxQrDataUrl.value = await QRCode.toDataURL(res.codeUrl, { width: 240, margin: 1 })
    wxDialogOpen.value = true
    startWxPolling()
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }, message?: string }
    errorMessage.value = err?.data?.message ?? err?.message ?? t('membership.subscribeFailed')
  } finally {
    wxStarting.value = false
  }
}

function startWxPolling() {
  stopWxPolling()
  // The payer scans the code on their phone; poll until the order settles
  wxPollTimer = setInterval(async () => {
    try {
      const res = await $fetch<{ status: string }>('/api/membership/wechat/order', {
        query: { outTradeNo: wxOutTradeNo.value }
      })
      if (res.status === 'success') {
        wxStatus.value = 'success'
        stopWxPolling()
        await refreshMembership()
      } else if (res.status === 'closed') {
        wxStatus.value = 'closed'
        stopWxPolling()
      }
    } catch (e) {
      console.warn('[membership] wechat order poll failed:', e)
    }
  }, 2000)
}

function closeWxDialog() {
  wxDialogOpen.value = false
  stopWxPolling()
}

onBeforeUnmount(stopWxPolling)
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
          <div class="mt-6 flex flex-col gap-2">
            <UButton
              v-if="canPayWithStripe()"
              class="w-full justify-center"
              color="primary"
              :variant="plan.isFeatured ? 'solid' : 'outline'"
              :loading="subscribing === plan.id"
              :disabled="subscribing !== null || wxStarting || syncing"
              @click="subscribe(plan)"
            >
              {{ myMembership?.isMember ? t('membership.renew') : t('membership.subscribe') }}
            </UButton>
            <UButton
              v-if="canPayWithWechat(plan)"
              class="w-full justify-center"
              color="success"
              :variant="plan.isFeatured && !canPayWithStripe() ? 'solid' : 'outline'"
              icon="i-lucide-qr-code"
              :loading="wxStarting"
              :disabled="subscribing !== null || wxStarting"
              @click="payWithWechat(plan)"
            >
              {{ t('membership.payWithWechat') }}
            </UButton>
            <p
              v-if="!canPayWithStripe() && !canPayWithWechat(plan)"
              class="text-center text-xs text-muted"
            >
              {{ t('membership.noPaymentMethod') }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <p class="mt-8 text-center text-xs text-muted">
      {{ t('membership.paymentNote') }}
    </p>

    <!-- WeChat Pay QR code dialog -->
    <UModal
      v-model:open="wxDialogOpen"
      :title="t('membership.wechatTitle')"
      :description="t('membership.wechatHint')"
      :dismissible="wxStatus !== 'success'"
    >
      <template #body>
        <div class="flex flex-col items-center gap-4 py-2">
          <template v-if="wxStatus === 'success'">
            <UIcon
              name="i-lucide-check-circle-2"
              class="size-16 text-success"
            />
            <p class="text-lg font-semibold text-highlighted">
              {{ t('membership.wechatPaid') }}
            </p>
          </template>
          <template v-else-if="wxStatus === 'closed'">
            <UIcon
              name="i-lucide-x-circle"
              class="size-16 text-error"
            />
            <p class="text-lg font-semibold text-highlighted">
              {{ t('membership.wechatClosed') }}
            </p>
          </template>
          <template v-else>
            <img
              v-if="wxQrDataUrl"
              :src="wxQrDataUrl"
              :alt="t('membership.wechatTitle')"
              class="size-60 rounded-lg bg-white p-3"
            >
            <div class="flex items-center gap-2 text-sm text-muted">
              <UIcon
                name="i-lucide-loader-circle"
                class="size-4 animate-spin"
              />
              {{ t('membership.wechatScanning') }}
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            color="neutral"
            variant="outline"
            @click="closeWxDialog"
          >
            {{ t('membership.close') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

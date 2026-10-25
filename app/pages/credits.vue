<script setup lang="ts">
interface CreditRow {
  id: number
  amount: number
  kind: string
  feature: string
  note: string
  createdAt: string
}

interface CreditPackage {
  id: number
  credits: number
  priceCents: number
  title: { en: string, zh: string }
  note: { en: string, zh: string }
}

interface PackagesPayload {
  packages: CreditPackage[]
  memberMonthly: number
  alipayEnabled: boolean
}

/**
 * Personal credit ledger: balance, self-serve top-up packs and recent
 * movements. Base-level page — every module that charges credits links here.
 */
const { t, locale } = useI18n()
const { isLoggedIn } = useAuth()
const { balance, setBalance } = useCredits()
const route = useRoute()

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))

const { data, pending, refresh } = await useAsyncData<{ balance: number, history: CreditRow[] }>(
  'credits:me:page',
  () => $fetch<{ balance: number, history: CreditRow[] }>('/api/credits/me'),
  { server: false, default: () => ({ balance: 0, history: [] }) }
)

const { data: shop } = await useAsyncData<PackagesPayload>(
  'credits:packages',
  () => $fetch<PackagesPayload>('/api/credits/packages'),
  { default: () => ({ packages: [], memberMonthly: 0, alipayEnabled: false }) }
)

const buying = ref(0)
const payError = ref('')
const payNotice = ref<{ tone: 'success' | 'warning', text: string } | null>(null)
/**
 * Auth state lives in client state, so the signed-in / signed-out branches are
 * rendered only after mount. Otherwise SSR HTML ("sign in") and the hydrated
 * client tree ("logged in") disagree and Vue logs a hydration mismatch.
 */
const mounted = ref(false)

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

function packageTitle(pkg: CreditPackage): string {
  return isZh.value ? pkg.title.zh : pkg.title.en
}

function packageNote(pkg: CreditPackage): string {
  return isZh.value ? pkg.note.zh : pkg.note.en
}

async function buy(pkg: CreditPackage) {
  if (buying.value) return
  buying.value = pkg.id
  payError.value = ''
  try {
    const result = await $fetch<{ payUrl: string }>('/api/credits/purchase', {
      method: 'POST',
      body: { packageId: pkg.id }
    })
    window.location.assign(result.payUrl)
  } catch (e: unknown) {
    const message = e as { data?: { message?: string }, message?: string }
    payError.value = message?.data?.message || message?.message || String(e)
  } finally {
    buying.value = 0
  }
}

/** The return page polls a few times: Alipay's notify may land a moment later. */
async function settle(outTradeNo: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await $fetch<{ status: string, balance: number }>('/api/credits/purchase', {
        query: { outTradeNo }
      })
      if (result.status === 'success') {
        setBalance(result.balance)
        payNotice.value = {
          tone: 'success',
          text: isZh.value ? '充值成功，积分已到账。' : 'Top-up complete — credits are in your balance.'
        }
        void refresh()
        return
      }
      if (result.status === 'closed') {
        payNotice.value = {
          tone: 'warning',
          text: isZh.value ? '订单已关闭，未扣款。' : 'The order was closed and nothing was charged.'
        }
        return
      }
    } catch {
      // Keep retrying: the order is simply not settled yet.
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  payNotice.value = {
    tone: 'warning',
    text: isZh.value
      ? '还没有收到支付结果。稍后刷新本页即可；如已扣款请联系管理员。'
      : 'Payment not confirmed yet. Refresh in a moment; contact an administrator if you were charged.'
  }
}

onMounted(() => {
  mounted.value = true
  if (!isLoggedIn.value) return
  void refresh()
  const outTradeNo = String(route.query.outTradeNo ?? '').trim()
  if (outTradeNo) void settle(outTradeNo)
})

const copy = computed(() => (isZh.value
  ? {
      title: '我的积分',
      lede: '按次消耗的功能会从余额中扣除；处理失败会自动退回。',
      balance: '当前余额',
      history: '最近记录',
      empty: '还没有积分记录。',
      signIn: '登录后查看积分',
      how: '积分可自助充值，也可以联系管理员发放。',
      topup: '充值积分',
      topupHint: '支付成功后积分自动到账，可用于所有按次计费的工具。',
      unavailable: '在线充值暂未开通，请联系管理员发放积分。',
      memberPerk: '会员每月自动获赠 {n} 积分',
      memberLink: '了解会员',
      feature: '功能',
      kind: '类型',
      time: '时间',
      buy: '购买'
    }
  : {
      title: 'My credits',
      lede: 'Metered features deduct from this balance, and failed runs are refunded automatically.',
      balance: 'Current balance',
      history: 'Recent activity',
      empty: 'No credit activity yet.',
      signIn: 'Sign in to see your credits',
      how: 'Top up instantly below, or ask an administrator for a grant.',
      topup: 'Top up credits',
      topupHint: 'Credits arrive automatically after payment and work in every metered tool.',
      unavailable: 'Online top-up is not enabled yet — ask an administrator for credits.',
      memberPerk: 'Members receive {n} credits every month',
      memberLink: 'See membership',
      feature: 'Feature',
      kind: 'Type',
      time: 'Time',
      buy: 'Buy'
    }))

const kindLabel = computed<Record<string, string>>(() => (isZh.value
  ? { grant: '发放', purchase: '购买', spend: '消耗', refund: '退回', adjust: '调整' }
  : { grant: 'Grant', purchase: 'Purchase', spend: 'Spend', refund: 'Refund', adjust: 'Adjust' }))

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(isZh.value ? 'zh-CN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

useSeoMeta({ title: 'Credits', robots: 'noindex, nofollow, noarchive' })
</script>

<template>
  <UContainer class="py-10">
    <div class="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
          {{ copy.title }}
        </h1>
        <p class="mt-2 text-sm text-muted">
          {{ copy.lede }}
        </p>
      </div>

      <UAlert
        v-if="mounted && !isLoggedIn"
        color="warning"
        variant="subtle"
        :title="copy.signIn"
        :description="t('credits.balanceHint')"
      />

      <UAlert
        v-if="payNotice"
        :color="payNotice.tone"
        variant="subtle"
        :description="payNotice.text"
      />

      <UCard>
        <p class="text-xs font-medium uppercase tracking-wide text-muted">
          {{ copy.balance }}
        </p>
        <p class="mt-1 flex items-center gap-2 text-4xl font-semibold text-highlighted">
          <UIcon
            name="i-lucide-coins"
            class="size-7 text-warning"
          />
          {{ balance ?? '—' }}
        </p>
        <p class="mt-2 text-xs text-muted">
          {{ copy.how }}
        </p>
        <NuxtLink
          v-if="shop.memberMonthly > 0"
          to="/membership"
          class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <UIcon
            name="i-lucide-crown"
            class="size-3.5"
          />
          {{ copy.memberPerk.replace('{n}', String(shop.memberMonthly)) }} ·
          {{ copy.memberLink }}
        </NuxtLink>
      </UCard>

      <UCard v-if="mounted && isLoggedIn">
        <template #header>
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ copy.topup }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ copy.topupHint }}
            </p>
          </div>
        </template>

        <UAlert
          v-if="!shop.alipayEnabled"
          color="neutral"
          variant="subtle"
          :description="copy.unavailable"
        />

        <div
          v-else
          class="grid gap-3 sm:grid-cols-3"
        >
          <div
            v-for="pkg in shop.packages"
            :key="pkg.id"
            class="flex flex-col rounded-xl border border-default p-3"
          >
            <p class="text-sm font-semibold text-highlighted">
              {{ packageTitle(pkg) }}
            </p>
            <p class="mt-1 text-xs leading-5 text-muted">
              {{ packageNote(pkg) }}
            </p>
            <p class="mt-3 text-lg font-semibold text-highlighted">
              {{ yuan(pkg.priceCents) }}
            </p>
            <UButton
              class="mt-3"
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-wallet"
              :loading="buying === pkg.id"
              @click="buy(pkg)"
            >
              {{ copy.buy }}
            </UButton>
          </div>
        </div>

        <UAlert
          v-if="payError"
          color="error"
          variant="subtle"
          :description="payError"
          class="mt-3"
        />
      </UCard>

      <UCard>
        <template #header>
          <p class="text-sm font-medium text-highlighted">
            {{ copy.history }}
          </p>
        </template>

        <!-- `mounted` also gates the skeleton: with `server: false` the SSR pass
             reports pending=false, so an unguarded skeleton would hydrate into
             a different tree than the server rendered. -->
        <div
          v-if="mounted && pending && !data.history.length"
          class="space-y-2"
        >
          <div class="h-8 animate-pulse rounded bg-elevated" />
          <div class="h-8 animate-pulse rounded bg-elevated" />
        </div>

        <p
          v-else-if="!data.history.length"
          class="py-6 text-center text-sm text-muted"
        >
          {{ copy.empty }}
        </p>

        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="row in data.history"
            :key="row.id"
            class="flex items-center gap-3 py-2.5 text-sm"
          >
            <span
              class="w-14 shrink-0 text-right font-medium"
              :class="row.amount >= 0 ? 'text-success' : 'text-error'"
            >
              {{ row.amount > 0 ? '+' : '' }}{{ row.amount }}
            </span>
            <span class="shrink-0 text-xs text-muted">{{ kindLabel[row.kind] ?? row.kind }}</span>
            <span class="min-w-0 flex-1 truncate text-muted">
              {{ row.feature === 'membership.monthly' ? copy.memberPerk.replace('{n}', String(row.amount)) : (row.feature || row.note || '—') }}
            </span>
            <span class="shrink-0 text-xs text-dimmed">{{ formatTime(row.createdAt) }}</span>
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>

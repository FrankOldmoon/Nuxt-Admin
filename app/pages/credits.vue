<script setup lang="ts">
interface CreditRow {
  id: number
  amount: number
  kind: string
  feature: string
  note: string
  createdAt: string
}

/**
 * Personal credit ledger: current balance plus the latest movements.
 * Base-level page — every module that charges credits links here.
 */
const { t, locale } = useI18n()
const { isLoggedIn } = useAuth()
const { balance } = useCredits()

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))

const { data, pending, refresh } = await useAsyncData<{ balance: number, history: CreditRow[] }>(
  'credits:me:page',
  () => $fetch<{ balance: number, history: CreditRow[] }>('/api/credits/me'),
  { server: false, default: () => ({ balance: 0, history: [] }) }
)

onMounted(() => {
  if (isLoggedIn.value) void refresh()
})

const copy = computed(() => (isZh.value
  ? {
      title: '我的积分',
      lede: '按次消耗的功能会从余额中扣除；处理失败会自动退回。',
      balance: '当前余额',
      history: '最近记录',
      empty: '还没有积分记录。',
      signIn: '登录后查看积分',
      how: '积分由管理员发放。如需充值，请联系站点管理员。',
      feature: '功能',
      kind: '类型',
      time: '时间'
    }
  : {
      title: 'My credits',
      lede: 'Metered features deduct from this balance, and failed runs are refunded automatically.',
      balance: 'Current balance',
      history: 'Recent activity',
      empty: 'No credit activity yet.',
      signIn: 'Sign in to see your credits',
      how: 'Credits are issued by an administrator. Contact them to top up.',
      feature: 'Feature',
      kind: 'Type',
      time: 'Time'
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
        v-if="!isLoggedIn"
        color="warning"
        variant="subtle"
        :title="copy.signIn"
        :description="t('credits.balanceHint')"
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
      </UCard>

      <UCard>
        <template #header>
          <p class="text-sm font-medium text-highlighted">
            {{ copy.history }}
          </p>
        </template>

        <div
          v-if="pending && !data.history.length"
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
              {{ row.feature || row.note || '—' }}
            </span>
            <span class="shrink-0 text-xs text-dimmed">{{ formatTime(row.createdAt) }}</span>
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>

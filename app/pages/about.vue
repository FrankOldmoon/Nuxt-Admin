<script setup lang="ts">
/**
 * Public "about" page (`/about`), linked from the header navigation.
 *
 * It explains what the site is and, more importantly, how files are handled:
 * every tool runs in the browser, so nothing is uploaded. Copy is written once
 * per language instead of going through the translation files because the page
 * is short and only needs Chinese and English.
 */
const { locale } = useI18n()
const localePath = useLocalePath()

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))

usePageMeta({
  title: () => (isZh.value ? '关于我们' : 'About us'),
  description: () => (isZh.value
    ? '办公宝是一套免费、免安装的在线办公与教学工具：PDF、图片、视频和表格处理都在浏览器里完成，文件不会上传到服务器。'
    : 'OfficeBao is a free, install-free set of online office and classroom tools. PDF, image, video and spreadsheet work runs in your browser, so files are never uploaded.')
})

const points = computed(() => (isZh.value
  ? [
      {
        icon: 'i-lucide-wand-sparkles',
        title: '一个页面，解决小任务',
        desc: '合并 PDF、压缩图片、转换格式、统计字数这类每天都会遇到的小事，不必安装软件，也不用注册就能用。'
      },
      {
        icon: 'i-lucide-shield-check',
        title: '文件留在你自己的设备上',
        desc: '绝大多数工具直接在浏览器里处理文件，数据不会离开你的电脑；少数需要服务器的功能会在卡片上单独标注。'
      },
      {
        icon: 'i-lucide-refresh-cw',
        title: '按真实需求持续增加',
        desc: '工具列表来自老师与办公场景的真实反馈，常用的会被保留和打磨，用不上的会被下掉。'
      }
    ]
  : [
      {
        icon: 'i-lucide-wand-sparkles',
        title: 'One page for small jobs',
        desc: 'Merging PDFs, compressing photos, converting formats or counting words — the everyday chores, without installing anything or creating an account.'
      },
      {
        icon: 'i-lucide-shield-check',
        title: 'Files stay on your device',
        desc: 'Nearly every tool processes files inside the browser, so nothing is uploaded. The few server-side tools are labelled on their cards.'
      },
      {
        icon: 'i-lucide-refresh-cw',
        title: 'Built from real requests',
        desc: 'The catalogue grows from what teachers and office teams actually ask for: the useful tools stay and get polished, the rest are retired.'
      }
    ]))
</script>

<template>
  <UContainer class="max-w-4xl py-12 sm:py-16">
    <UBadge
      color="primary"
      variant="soft"
      size="sm"
    >
      {{ isZh ? '关于' : 'About' }}
    </UBadge>

    <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      {{ isZh ? '免费、免安装的办公与教学工具箱' : 'A free, install-free toolbox for work and class' }}
    </h1>

    <p class="mt-3 max-w-2xl text-base leading-7 text-muted">
      {{ isZh
        ? '办公宝把日常办公和课堂里最琐碎的文件处理集中到一个页面：打开就能用，处理完直接下载，文件不必经过我们的服务器。'
        : 'OfficeBao gathers the fiddly file chores of an ordinary workday or lesson into one page: open a tool, finish the job, download the result — without handing your files to a server.' }}
    </p>

    <div class="mt-10 grid gap-4 sm:grid-cols-3">
      <UCard
        v-for="point in points"
        :key="point.title"
        class="h-full"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              :name="point.icon"
              class="size-5 text-primary"
            />
            <span class="font-semibold text-highlighted">{{ point.title }}</span>
          </div>
        </template>
        <p class="text-sm leading-6 text-muted">
          {{ point.desc }}
        </p>
      </UCard>
    </div>

    <div class="mt-10 flex flex-wrap items-center gap-3">
      <UButton
        :to="localePath('/')"
        icon="i-lucide-layout-grid"
        size="lg"
        color="primary"
      >
        {{ isZh ? '浏览全部工具' : 'Browse the tools' }}
      </UButton>
      <UButton
        :to="localePath('/membership')"
        icon="i-lucide-badge-check"
        size="lg"
        color="neutral"
        variant="soft"
      >
        {{ isZh ? '查看会员方案' : 'See membership plans' }}
      </UButton>
    </div>
  </UContainer>
</template>

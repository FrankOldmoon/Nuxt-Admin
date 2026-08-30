<template>
  <div class="mx-auto max-w-4xl space-y-8 p-6">
    <h1 class="text-xl font-bold">RichEditor / Ueditor 组件测试</h1>

    <!-- 1. 文本模式 -->
    <section class="space-y-2">
      <h2 class="text-base font-semibold">1. 文本模式（v-model: string）</h2>
      <BaseRichEditor v-model="textContent" />
      <UInput v-model="textContent" label="当前文本值" size="sm" />
    </section>

    <!-- 2. JSON 模式（含 html/pdf/vfiles/tabs 四种扩展） -->
    <section class="space-y-2">
      <h2 class="text-base font-semibold">2. JSON 模式（含 4 种扩展节点，点右上角铅笔编辑）</h2>
      <BaseRichEditor v-model="jsonContent" :allow-text-mode="false" />
    </section>

    <!-- 3. 直接渲染预览 -->
    <section class="space-y-2">
      <h2 class="text-base font-semibold">3. BaseUeditorRender 只读渲染</h2>
      <div class="rounded-md border border-default p-4">
        <BaseUeditorRender :json="jsonContent" />
      </div>
    </section>

    <!-- 4. 独立编辑器 -->
    <section class="space-y-2">
      <h2 class="text-base font-semibold">4. BaseUeditor 独立编辑器（v-model: object）</h2>
      <div class="rounded-md border border-default p-4">
        <BaseUeditor v-model="editorJson" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const textContent = ref('这是一段纯文本内容')

const pdfUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'

// 包含 4 种扩展节点的 Tiptap JSON 示例
const jsonContent = ref({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '富文本示例（含扩展节点）' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '下面依次是 HTML、PDF、Tabs、Vfiles 四种扩展节点。' }] },
    {
      type: 'vue',
      attrs: {
        type: 'html',
        content: '<h3 style="color:#2563eb">HTML 节点</h3><p>由 iframe 隔离渲染的 HTML 内容，支持脚本。</p><button onclick="alert(\'hi from html\')">点击</button>',
      },
    },
    {
      type: 'vue',
      attrs: {
        type: 'pdf',
        content: JSON.stringify({ url: pdfUrl, pages: '1-2', height: 600 }),
      },
    },
    {
      type: 'vue',
      attrs: {
        type: 'tabs',
        content: JSON.stringify({
          tabs: [
            { label: 'Tab 1', content: '## 第一个标签页\n\n内容使用 markdown 编写，可包含 **加粗** 与 *斜体*。' },
            { label: 'Tab 2', content: '> 第二个标签页的内容（引用）。' },
          ],
        }),
      },
    },
    {
      type: 'vue',
      attrs: {
        type: 'vfiles',
        content: JSON.stringify({
          items: [
            {
              id: 'f1', label: '项目文档', type: 'folder', children: [
                { id: 'a', label: 'README.md', type: 'file', content: '# 项目简介\n\n这是一个虚拟文件示例。' },
                { id: 'b', label: 'api.md', type: 'file', content: '## API 文档\n\n`GET /api/hello` 返回问候。' },
              ],
            },
            { id: 'c', label: 'notes.txt', type: 'file', content: '随手记一些想法。' },
          ],
        }),
      },
    },
    { type: 'paragraph', content: [{ type: 'text', text: '—— 测试内容结束 ——' }] },
  ],
})

// 独立编辑器演示用（空文档）
const editorJson = ref<Record<string, any>>({ type: 'doc', content: [{ type: 'paragraph' }] })
</script>

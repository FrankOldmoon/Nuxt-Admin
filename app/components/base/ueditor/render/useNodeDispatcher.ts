import { defineComponent, computed } from 'vue'
import { renderTextWithMarks } from './helpers'

// 所有节点类型 → 渲染组件 映射（导入保持不变）
import Paragraph from './nodes/paragraph.vue'
import Heading from './nodes/heading.vue'
import Blockquote from './nodes/blockquote.vue'
import BulletList from './nodes/bullet-list.vue'
import OrderedList from './nodes/ordered-list.vue'
import ListItem from './nodes/list-item.vue'
import TaskList from './nodes/task-list.vue'
import TaskItem from './nodes/task-item.vue'
import HardBreak from './nodes/hard-break.vue'
import HorizontalRule from './nodes/horizontal-rule.vue'
import PageBreak from './nodes/page-break.vue'
import Table from './nodes/table.vue'
import TableRow from './nodes/table-row.vue'
import TableCell from './nodes/table-cell.vue'
import TableHeader from './nodes/table-header.vue'
import Column from './nodes/column.vue'
import ColumnContainer from './nodes/column-container.vue'
import DetailsSummary from './nodes/details-summary.vue'
import DetailsContent from './nodes/details-content.vue'
import DetailsView from './nodes/details.vue'

import ImageView from './nodes/image.vue'
import VideoView from './nodes/video.vue'
import AudioView from './nodes/audio.vue'
import FileView from './nodes/file.vue'
import IframeView from './nodes/iframe.vue'
import CodeBlockView from './nodes/code-block.vue'
import CalloutView from './nodes/callout.vue'
import TextBoxView from './nodes/text-box.vue'

import VueView from './nodes/vue.vue'

export const componentNodeTypes: Record<string, any> = {
  // 基础节点
  paragraph: Paragraph,
  heading: Heading,
  blockquote: Blockquote,
  bulletList: BulletList,
  orderedList: OrderedList,
  listItem: ListItem,
  taskList: TaskList,
  taskItem: TaskItem,
  hardBreak: HardBreak,
  horizontalRule: HorizontalRule,
  pageBreak: PageBreak,

  // 表格
  table: Table,
  tableRow: TableRow,
  tableCell: TableCell,
  tableHeader: TableHeader,

  // 分栏
  column: Column,
  columnContainer: ColumnContainer,

  // 详情
  details: DetailsView,
  detailsSummary: DetailsSummary,
  detailsContent: DetailsContent,

  // 媒体
  image: ImageView,
  inlineImage: ImageView,
  video: VideoView,
  audio: AudioView,
  file: FileView,
  iframe: IframeView,

  // 块级组件
  codeBlock: CodeBlockView,
  callout: CalloutView,
  textBox: TextBoxView,

  vue: VueView,
}

// 文本节点渲染组件：封装 renderTextWithMarks 逻辑
export const TextRenderer = defineComponent({
  name: 'TextRenderer',
  props: {
    text: { type: String, default: '' },
    marks: { type: Array, default: () => [] },
  },
  setup(props) {
    return () => renderTextWithMarks(props.text, props.marks)
  },
})

export function useNodeDispatcher(props: any) {
  const currentComponent = computed(() => {
    return componentNodeTypes[props.node.type] || null
  })

  return {
    TextRenderer,
    currentComponent,
  }
}

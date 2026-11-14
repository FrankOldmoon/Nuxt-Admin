import { backfillKnowledgeEmbeddings } from '../../../modules/sms/server/knowledge'

/** 为尚未写入向量的知识库文章补 embedding；未配置服务时为空操作。 */
export default defineTask({
  meta: {
    name: 'sms:embedding-backfill',
    description: 'Backfill vector embeddings for knowledge articles missing one'
  },
  async run() {
    const result = await backfillKnowledgeEmbeddings()
    console.log('[sms:embedding-backfill]', result)
    return { result }
  }
})

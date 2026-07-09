import 'dotenv/config'
import { ChromaClient } from 'chromadb'
import { chunkPolicy } from '../lib/rag/chunk.ts'
import { embedText } from '../lib/rag/embed.ts'

const COLLECTION_NAME = 'policy_v2'
const POLICY_PATH = 'docs/rag/한빛생명_가상약관_v2.0.md'

;(async () => {
  const client = new ChromaClient({ host: 'localhost', port: 8000 })

  // chromadb@3.5.0: cosine은 configuration.hnsw.space 로 지정 (구 metadata 문법 아님)
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: null,
    configuration: { hnsw: { space: 'cosine' } },
  })

  const chunks = chunkPolicy(POLICY_PATH)
  console.log(`청킹 완료: ${chunks.length}조각`) // 22 기대

  for (const chunk of chunks) {
    const embedding = await embedText(chunk.본문, 'RETRIEVAL_DOCUMENT')
    await collection.upsert({
      ids: [chunk.조항번호],
      embeddings: [embedding],
      documents: [chunk.본문],
      metadatas: [
        {
          제목: chunk.제목,
          관련항목: chunk.관련항목.join(','), // 배열 → 문자열 (chroma metadata 배열 금지)
          출처: chunk.출처,
        },
      ],
    })
    console.log(`색인: ${chunk.조항번호} (${chunk.제목})`)
  }

  const count = await collection.count()
  console.log(`저장 완료. collection 총 개수: ${count}`) // 22 기대
})()

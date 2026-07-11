import 'dotenv/config'
import { ChromaClient, CloudClient } from 'chromadb'
import { chunkPolicy } from '../lib/rag/chunk.ts'
import { embedText } from '../lib/rag/embed.ts'

const COLLECTION_NAME = 'policy_v2'
const POLICY_PATH = 'docs/rag/한빛생명_가상약관_v2.0.md'

;(async () => {
  const isCloud = !!process.env.CHROMA_API_KEY
  const client = isCloud
    ? new CloudClient()                                   // 배포: CHROMA_API_KEY/TENANT/DATABASE env 자동 사용
    : new ChromaClient({ host: 'localhost', port: 8000 }) // 로컬 개발

  // ⚠ 인덱스 종류 분기: 로컬=HNSW, Cloud=SPANN — 거리 함수 지정 방식이 다름
  // Cloud에 hnsw 설정을 주면 에러 없이 무시되고 기본 L2로 색인되는 조용한 함정 주의
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    configuration: isCloud
      ? { spann: { space: 'cosine' } }
      : { hnsw:  { space: 'cosine' } },
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

// lib/rag/indexPolicy.ts
// 약관 문서를 Chroma에 색인하는 재사용 가능 함수.
// scripts/index-policy.ts(CLI 스크립트)가 파일을 읽어 이 함수를 호출한다.

import { ChromaClient, CloudClient } from 'chromadb'
import { chunkPolicyText } from './chunk'
import { embedText } from './embed'

/**
 * 약관 텍스트를 조 단위로 청킹·임베딩해 Chroma 컬렉션에 색인한다.
 * 실패는 삼키지 않고 그대로 throw한다(호출부 책임).
 * @param content 약관 전체 텍스트 (파일 읽기는 호출부 책임)
 * @param collectionName 대상 Chroma 컬렉션 이름
 * @returns 색인 후 collection.count()로 재조회한 실제 저장 개수
 */
export async function indexPolicyDocument(
  content: string,
  collectionName: string,
): Promise<number> {
  const isCloud = !!process.env.CHROMA_API_KEY
  const client = isCloud
    ? new CloudClient()                                   // 배포: CHROMA_API_KEY/TENANT/DATABASE env 자동 사용
    : new ChromaClient({ host: 'localhost', port: 8000 }) // 로컬 개발

  // ⚠ 인덱스 종류 분기: 로컬=HNSW, Cloud=SPANN — 거리 함수 지정 방식이 다름
  // Cloud에 hnsw 설정을 주면 에러 없이 무시되고 기본 L2로 색인되는 조용한 함정 주의
  const collection = await client.getOrCreateCollection({
    name: collectionName,
    configuration: isCloud
      ? { spann: { space: 'cosine' } }
      : { hnsw:  { space: 'cosine' } },
  })

  const chunks = chunkPolicyText(content)
  console.log(`청킹 완료: ${chunks.length}조각`)

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

  return collection.count()
}

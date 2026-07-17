// lib/rag/search.ts
// 약관 검색 전담 모듈 — 질의 텍스트로 chroma에서 관련 약관 조각을 찾는다.
// collection은 app_config.rag_collection_name이 정본 — 관리자가 재색인 시
// 이 값을 바꾸면 다음 검색부터 즉시 반영된다(모듈 로드 시 캐시 금지, 매 호출 재조회).
// ⚠ taskType: 검색은 RETRIEVAL_QUERY (색인은 RETRIEVAL_DOCUMENT — 다름)

import { ChromaClient, CloudClient } from 'chromadb'
import { embedText } from './embed'
import * as configRepo from '../db/configRepo'

const DEFAULT_TOP_K = 5

export interface PolicySearchResult {
  조항번호: string   // chroma id
  제목: string       // metadata
  관련항목: string   // metadata (색인 시 "B1,D6" 문자열로 저장됨)
  본문: string       // document
  거리: number       // cosine distance (작을수록 유사)
}

export async function searchPolicy(
  query: string,
  topK: number = DEFAULT_TOP_K
): Promise<PolicySearchResult[]> {
  const collectionName = await configRepo.get('rag_collection_name')
  if (!collectionName) {
    throw new Error('rag_collection_name 미설정 — app_config 확인 필요')
  }

  const client = process.env.CHROMA_API_KEY
    ? new CloudClient()                                   // 배포: env 3개(API_KEY/TENANT/DATABASE) 자동 사용
    : new ChromaClient({ host: 'localhost', port: 8000 }) // 로컬 개발
  // getCollection: embeddingFunction은 optional이고 null 미허용 → 생략
  const collection = await client.getCollection({
    name: collectionName,
  })

  const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY')

  const res = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
  })

  const ids = res.ids?.[0] ?? []
  const documents = res.documents?.[0] ?? []
  const metadatas = res.metadatas?.[0] ?? []
  const distances = res.distances?.[0] ?? []

  const results: PolicySearchResult[] = []
  for (let i = 0; i < ids.length; i++) {
    results.push({
      조항번호: String(ids[i]),
      제목: String(metadatas[i]?.제목 ?? ''),
      관련항목: String(metadatas[i]?.관련항목 ?? ''),
      본문: String(documents[i] ?? ''),
      거리: Number(distances[i] ?? -1),
    })
  }
  return results
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { searchPolicy } from './search'

export type ConsultationContext = {
  hardDocs: {
    rubric: string
    matchingTable: string
    naRules: string
  }
  ragDocs: {
    policy: string
    productSheet: string
  }
}

// 1단계: 참조자료 전체를 파일시스템에서 읽어 반환
// 2단계에서 ragDocs 부분만 ChromaDB 검색으로 교체 (이 함수 시그니처는 유지)
export async function retrieveContext(
  utteranceText: string
): Promise<ConsultationContext> {
  const root = process.cwd()

  let policy: string
  if (process.env.RAG_ENABLED === 'true') {
    const results = await searchPolicy(utteranceText)
    if (results.length === 0) {
      throw new Error('RAG 검색 결과 0건 — chroma 색인 상태를 확인하세요')
    }
    policy = results.map((r) => r.본문).join('\n\n')
  } else {
    policy = readFileSync(
      join(root, 'docs/rag/한빛생명_가상약관_v2.0.md'),
      'utf-8'
    )
  }

  return {
    hardDocs: {
      rubric: readFileSync(
        join(root, 'docs/hard/보험상담_평가루브릭_v1_5.md'),
        'utf-8'
      ),
      matchingTable: readFileSync(
        join(root, 'docs/hard/한빛생명_니즈상품_매칭표_v1_0.md'),
        'utf-8'
      ),
      naRules: readFileSync(
        join(root, 'docs/hard/N_A_매핑규칙_확정본.md'),
        'utf-8'
      ),
    },
    ragDocs: {
      policy,
      productSheet: readFileSync(
        join(root, 'docs/rag/한빛생명_상품설명서_v1_0.md'),
        'utf-8'
      ),
    },
  }
}

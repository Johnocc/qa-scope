import { readFileSync } from 'fs'
import { join } from 'path'

interface KeywordMapping {
  keyword: string
  codes: string[]
}

interface ProductKeywordConfig {
  version: string
  match_strategy: string
  mappings: KeywordMapping[]
  always_include: string[]
  fallback: string
}

let _config: ProductKeywordConfig | null = null

export function loadProductKeywordConfig(): ProductKeywordConfig {
  if (_config) return _config
  const raw = readFileSync(join(process.cwd(), 'config', 'product-keywords.json'), 'utf-8')
  _config = JSON.parse(raw) as ProductKeywordConfig
  return _config
}

/**
 * 발화 텍스트에서 상품 키워드를 감지해 상품 코드 배열을 반환.
 * mappings 순서대로(위→아래) 검사 — 긴 키워드 먼저 나열해 최장일치 보장.
 * 매칭된 키워드는 텍스트에서 제거 후 다음 키워드 검사 (오탐 방지).
 */
export function detectProductCodes(text: string): string[] {
  const config = loadProductKeywordConfig()
  const codesSet = new Set<string>()
  let remaining = text

  for (const mapping of config.mappings) {
    if (remaining.includes(mapping.keyword)) {
      for (const code of mapping.codes) {
        codesSet.add(code)
      }
      // 매칭된 키워드 제거 — 후속 짧은 키워드 오탐 방지
      remaining = remaining.split(mapping.keyword).join('')
    }
  }

  return Array.from(codesSet)
}

/**
 * 감지된 상품 코드에 해당하는 설명서 청크만 추출.
 * "## 공통 사항" 청크는 항상 포함. 원문 순서(P1→P7→공통) 유지.
 */
export function selectProductChunks(codes: string[]): string {
  const config = loadProductKeywordConfig()
  const raw = readFileSync(
    join(process.cwd(), 'docs/rag/한빛생명_상품설명서_v1_0.md'),
    'utf-8'
  )

  // "## " 헤더 기준으로 분할 (첫 번째 빈 조각 제거)
  const sections = raw.split(/^(?=## )/m).filter((s) => s.trim().length > 0)

  const selected: string[] = []
  for (const section of sections) {
    const headerMatch = section.match(/^## (.+)/)
    if (!headerMatch) continue
    const headerTitle = headerMatch[1].trim()

    // P코드 매칭: "## P1. ..." 형태에서 코드 추출
    const codeMatch = headerTitle.match(/^(P\d+)\./)
    if (codeMatch) {
      if (codes.includes(codeMatch[1])) {
        selected.push(section.trimEnd())
      }
    } else {
      // P코드 없는 섹션 — always_include 대상인지 확인
      const isAlways = config.always_include.some((phrase) => headerTitle.includes(phrase))
      if (isAlways) {
        selected.push(section.trimEnd())
      }
    }
  }

  return selected.join('\n\n')
}

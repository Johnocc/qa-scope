// lib/rag/chunk.ts
// 약관(.md)을 "조(條) 단위"로 자르는 청킹 모듈.
// 각 조각은 임베딩·검색의 최소 단위가 된다.
// - 왜 조 단위인가: 하나의 조가 하나의 완결된 규정 = 채점 근거 1개와 대응.
//   너무 잘게(문장) 자르면 문맥이 끊기고, 너무 크게(장) 자르면 검색이 뭉뚱그려짐.

import { readFileSync } from 'fs'

// 약관 조각 하나의 구조
export interface PolicyChunk {
  조항번호: string      // 예: "제18조", "제7조의2"
  제목: string          // 예: "청약철회권"
  관련항목: string[]    // 예: ["D5"] — 채점 항목 태그(인덱스)
  본문: string          // 조 전체 텍스트(제목+항+채점근거)
  출처: string          // "약관"
}

// "**제N조 (제목 — 태그)**" 형태의 조 시작 줄을 인식.
// (?:의\d+)? 는 "제7조의2" 같은 파생 조항까지 잡기 위함.
const 조시작패턴 = /^\*\*제(\d+조(?:의\d+)?)\s*\(([^)]*)\)\*\*/

/**
 * 약관 마크다운 파일을 조 단위 조각 배열로 변환한다.
 * @param filePath 약관 .md 파일 경로
 */
export function chunkPolicy(filePath: string): PolicyChunk[] {
  const raw = readFileSync(filePath, 'utf-8')
  // 윈도우(\r\n)·유닉스(\n) 줄바꿈 모두 대응
  const lines = raw.split(/\r?\n/)

  const chunks: PolicyChunk[] = []
  let current: { 조항번호: string; 제목: string; 본문줄: string[] } | null = null

  for (const line of lines) {
    const m = line.match(조시작패턴)
    if (m) {
      // 새 조 시작 → 이전 조각을 확정 저장
      if (current) chunks.push(finalize(current))
      // 제목에서 "청약철회권 — D5 근거" 중 "—" 앞부분만 제목으로
      const 제목 = m[2].split('—')[0].trim()
      current = { 조항번호: '제' + m[1], 제목, 본문줄: [line] }
    } else if (current) {
      // 다음 장 제목(## 제N장)이 나오면 현재 조 본문은 여기서 끝
      if (/^##\s/.test(line)) {
        chunks.push(finalize(current))
        current = null
        continue
      }
      current.본문줄.push(line)
    }
  }
  if (current) chunks.push(finalize(current))

  return chunks
}

// 조각 하나를 최종 형태로 마무리:
// - 본문을 합치고
// - 본문 전체(제목+채점근거 인용문 포함)에서 채점 태그(A~E + 숫자) 추출
//   → 제목에만 있는 태그(제18조=D5)와 본문 인용문에만 있는 태그(제12조=D4) 모두 잡음
function finalize(c: {
  조항번호: string
  제목: string
  본문줄: string[]
}): PolicyChunk {
  const 본문 = c.본문줄.join('\n').trim()
  const 관련항목 = [...new Set(본문.match(/[A-E]\d/g) || [])]
  return { 조항번호: c.조항번호, 제목: c.제목, 관련항목, 본문, 출처: '약관' }
}

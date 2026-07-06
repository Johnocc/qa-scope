import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTranscript } from './parse'
import { retrieveContext } from '../rag/index'
import { callLLM } from '../llm/index'
import { validateOutput } from './validate'
import { fillItemScores, calcAggregate } from './calculate'
import { saveResult } from '../db/index'
import { persistEvaluation } from '../db/persist'
import type { EvalOutput } from './types'

function cleanAndParse(raw: string): unknown | null {
  const stripped = raw
    .replace(/^```(?:json)?\r?\n?/m, '')
    .replace(/\r?\n?```$/m, '')
    .trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
}

function stringifyFlagEvidence(evidence: unknown): string {
  const one = (e: unknown): string => {
    if (typeof e === 'string') return e
    if (e !== null && typeof e === 'object') {
      const o = e as Record<string, unknown>
      if ('인용문' in o) {
        const id = o['대화ID'] !== undefined ? `${o['대화ID']}: ` : ''
        return `${id}'${o['인용문']}'`
      }
    }
    return JSON.stringify(e)
  }
  if (Array.isArray(evidence)) return evidence.map(one).join(' / ')
  return one(evidence)
}

export async function scoreConsultation(
  상담ID: string,
  rawText: string
): Promise<EvalOutput> {
  // 1. 발화 파싱
  const { utterances } = parseTranscript(rawText)

  // 2. 참조자료 로드
  const utteranceText = utterances.map((u) => u.대화내용).join('\n')
  const context = await retrieveContext(utteranceText)

  // 3. 시스템 프롬프트 조립
  const promptBase = readFileSync(
    join(process.cwd(), 'prompts', 'scoring-prompt.md'),
    'utf-8'
  )
  const systemPrompt = [
    promptBase,
    '## 첨부: 평가 루브릭 v1.5',
    context.hardDocs.rubric,
    '## 첨부: 니즈-상품 매칭표 v1.0',
    context.hardDocs.matchingTable,
    '## 첨부: N/A 매핑규칙',
    context.hardDocs.naRules,
    '## 첨부: 가상약관 v2.0',
    context.ragDocs.policy,
    '## 첨부: 상품설명서',
    context.ragDocs.productSheet,
  ].join('\n\n')

  // 4. 유저 메시지 조립
  const userMessage = JSON.stringify({ 상담ID, 발화: utterances }, null, 2)

  // 5. 1차 LLM 호출
  const raw1 = await callLLM(systemPrompt, userMessage)
  let parsed = cleanAndParse(raw1)

  // 6. 파싱 실패 시 1회 재시도
  if (parsed === null) {
    const retryMessage =
      userMessage + '\n\n반드시 순수 JSON 하나만 출력. 설명·코드펜스 금지.'
    const raw2 = await callLLM(systemPrompt, retryMessage)
    parsed = cleanAndParse(raw2)
    if (parsed === null) {
      throw new Error(
        'LLM 응답을 JSON으로 파싱할 수 없습니다 (재시도 포함 2회 실패)'
      )
    }
  }

  // 전처리: 스키마에 없는 필드 제거 (validateOutput 전)
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj['항목평가'])) {
      for (const item of obj['항목평가']) {
        if (item !== null && typeof item === 'object') {
          delete (item as Record<string, unknown>)['항목명']
        }
      }
    }
    if (obj['고객만족'] === null) {
      delete obj['고객만족']
    }
    if (!Array.isArray(obj['위험플래그'])) {
      obj['위험플래그'] = []
    }
    // LLM이 위험플래그.근거를 항목평가 근거 형식({대화ID,인용문} 객체/배열)으로
    // 채우는 경우가 있어 스키마(string)에 맞게 문자열로 정규화한다.
    for (const flag of obj['위험플래그'] as unknown[]) {
      if (flag !== null && typeof flag === 'object') {
        const f = flag as Record<string, unknown>
        if (typeof f['근거'] !== 'string') {
          f['근거'] = stringifyFlagEvidence(f['근거'])
        }
      }
    }
    // 집계는 LLM 산수 미신뢰 원칙(§7-1)에 따라 9단계에서 코드가 재계산해
    // 덮어쓴다. LLM이 계산을 틀려도(예: 환산총점>100) 채점이 죽지 않도록
    // 검증 전에 스키마 통과용 중립 스텁으로 치환한다.
    obj['집계'] = {
      원점수합: 0,
      적용배점합: 100,
      환산총점: 0,
      위험표시여부: false,
      상태라벨: '정상',
    }
  }

  // 7. 스키마 검증
  const validation = validateOutput(parsed)
  if (!validation.valid) {
    throw new Error(
      `스키마 검증 실패:\n${JSON.stringify(validation.errors, null, 2)}`
    )
  }

  const llmOutput = parsed as EvalOutput

  // 8. 배점·획득점수 채우기 (코드가 덮어씀)
  const filledItems = fillItemScores(llmOutput.항목평가)

  // 9. 집계·플래그 계산 (코드가 덮어씀 — 규칙 5 포함)
  const { 집계, flags } = calcAggregate(filledItems, llmOutput.위험플래그)

  // 10. 최종 객체 조립
  const final: EvalOutput = {
    ...llmOutput,
    상담ID,
    평가메타: {
      평가주체: 'AI_1차',
      AI모델: process.env.LLM_MODEL ?? 'gemini-2.5-flash',
      루브릭버전: 'v1.5',
      평가일시: new Date().toISOString(),
    },
    항목평가: filledItems,
    위험플래그: flags,
    집계,
  }

  // 11. 최종 객체 재검증 — 코드 재계산 결과까지 포함해 스키마 ver2 준수 보장
  const finalValidation = validateOutput(final)
  if (!finalValidation.valid) {
    throw new Error(
      `최종 결과 스키마 검증 실패(재계산 후):\n${JSON.stringify(finalValidation.errors, null, 2)}`
    )
  }

  // 12. 저장 — 로컬 JSON(감사용 백업) + MySQL(조회 정본)
  await saveResult(final)
  const persisted = await persistEvaluation(상담ID, utterances, final)
  if (persisted.unmatchedQuotes.length > 0) {
    console.warn(
      `⚠ 인용 원문대조 불일치 ${persisted.unmatchedQuotes.length}건:`,
      persisted.unmatchedQuotes,
    )
  }
  console.log(
    `✓ MySQL 저장 완료: consultation_id=${persisted.consultationId}, evaluation_id=${persisted.evaluationId}`,
  )
  return final
}

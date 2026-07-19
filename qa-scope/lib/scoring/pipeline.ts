import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTranscript } from './parse'
import { retrieveContext } from '../rag/index'
import { callLLM } from '../llm/index'
import { validateOutput } from './validate'
import { fillItemScores, calcAggregate } from './calculate'
import { persistEvaluation } from '../db/persist'
import type { PersistResult } from '../db/persist'
import { createNotification } from '../db/notificationRepo'
import * as configRepo from '../db/configRepo'
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

// 위험플래그.근거를 스키마(string)에 맞게 문자열로 변환.
// LLM이 {대화ID, 인용문} 객체/배열 형식으로 채우는 경우까지 처리한다.
function stringifyFlagEvidence(evidence: unknown): string {
  const one = (e: unknown): string => {
    // undefined·null 모두 빈 문자열로. (JSON.stringify(undefined)=undefined→검증사망,
    // JSON.stringify(null)="null"→DB에 문자열 "null" 저장, 둘 다 여기서 차단)
    if (e == null) return ''
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

export interface ScoreOptions {
  /**
   * 확정 검수 존재 건 재채점 정책 (검수_쓰기_API계약_v1.md 결정 3) —
   * 저장 어댑터(persistEvaluation)로 그대로 전달. 기본 skip(안전).
   * 배치는 채점 시작 전 reviewRepo.hasConfirmedReview()로 먼저 거를 것.
   */
  onConfirmedReview?: 'skip' | 'force'
  /**
   * 신규 상담 메타 — 업로드 채점(화면⑤) 전용. 값이 있으면 persistEvaluation이
   * 신규 상담 생성 시 그대로 쓰고, 없으면 기존 기본값('unknown' 등)을 유지한다
   * (터미널 스크립트 score-one.ts/score-all.ts는 이 옵션을 넘기지 않으므로
   * 기존 동작 불변).
   */
  agentId?: string
  consultedAt?: string // 'YYYY-MM-DD HH:MM:SS'
  consultationType?: string
  /** 3-E 검증 로그(stage='인용대조') 기록 여부 — persistEvaluation으로 그대로 전달 */
  logVerification?: boolean
  /**
   * persistEvaluation() 저장 직후 PersistResult(unmatchedQuotes 등)를 그대로
   * 받는 콜백 — scoreConsultation의 반환 타입(EvalOutput)은 건드리지 않고
   * 부가정보만 뽑아쓸 때 사용(업로드 API 전용, opt-in). 기존 호출부는 안 넘기므로
   * 무영향.
   */
  onPersisted?: (result: PersistResult) => void
}

export async function scoreConsultation(
  상담ID: string,
  rawText: string,
  options: ScoreOptions = {}
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

  // 전처리: 스키마에 없는/타입 안 맞는 필드 정리 (validateOutput 전)
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>

    // 항목평가: 여분 키 제거 + 코멘트 타입 정리
    if (Array.isArray(obj['항목평가'])) {
      for (const item of obj['항목평가']) {
        if (item !== null && typeof item === 'object') {
          const it = item as Record<string, unknown>
          delete it['항목명']
          delete it['상세판단']
          // 코멘트가 문자열이 아니면 제거 (선택 필드)
          if ('코멘트' in it && typeof it['코멘트'] !== 'string') {
            delete it['코멘트']
          }
        }
      }
    }

    // 고객만족: null이면 제거 (선택 필드)
    if (obj['고객만족'] === null) {
      delete obj['고객만족']
    }

    // 위험플래그: 배열 아니면 빈 배열로
    if (!Array.isArray(obj['위험플래그'])) {
      obj['위험플래그'] = []
    }
    // 위험플래그[*].근거 → 문자열 정규화 (객체/배열 형식 대응)
    for (const flag of obj['위험플래그'] as unknown[]) {
      if (flag !== null && typeof flag === 'object') {
        const f = flag as Record<string, unknown>
        if (typeof f['근거'] !== 'string') {
          f['근거'] = stringifyFlagEvidence(f['근거'])
        }
      }
    }

    // 평가메타: 통째 제거 (10단계에서 코드가 새로 조립해 덮어쓰므로 LLM 값은 불필요).
    //   여분키 필터링 방식은 평가일시:null 같은 '허용 키의 잘못된 값'을 못 걸러
    //   검증에서 죽었다(dummy_02). 통째 지우면 그 경로가 원천 차단된다.
    delete obj['평가메타']

    // ※ 요약·종합피드백은 LLM이 생성하는 콘텐츠라 코드가 재생성하지 않는다.
    //   누락 시 ''로 백필하면 '빈 평가'가 그대로 저장되므로, 백필하지 않고
    //   7단계 스키마 검증에서 의도적으로 실패시킨다. (빈 평가 저장 방지 — 재추가 금지)

    // 판매정보.확인절차 영문 키 → 한글 키 정규화
    if (obj['판매정보'] !== null && typeof obj['판매정보'] === 'object') {
      const 판매정보 = obj['판매정보'] as Record<string, unknown>
      if (typeof 판매정보['확인절차'] === 'object' && 판매정보['확인절차'] !== null) {
        const 절차 = 판매정보['확인절차'] as Record<string, unknown>
        const keyMap: Record<string, string> = {
          purpose: '가입목적',
          financial_status: '재정상황',
          financialStatus: '재정상황',
          existing_contract: '기존계약',
          existingContract: '기존계약',
        }
        for (const [eng, kor] of Object.entries(keyMap)) {
          if (eng in 절차) {
            절차[kor] = 절차[eng]
            delete 절차[eng]
          }
        }
      }
    }

    // 집계는 LLM 산수 미신뢰 원칙(§7-1)에 따라 9단계에서 코드가 재계산해
    // 덮어쓴다. LLM이 계산을 틀려도(예: 환산총점>100) 검증 전에 죽지 않도록
    // 스키마 통과용 중립 스텁으로 치환한다.
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
  //    저점수 컷 정본 = app_config.low_score_cut (재배포 없이 조정 가능).
  //    DB 저장(evaluationRepo)도 같은 키·같은 폴백을 읽으므로 엔진 JSON과
  //    DB status_label이 항상 같은 컷으로 계산된다.
  //    getNumber는 DB 미기동 시 throw 없이 폴백을 반환한다.
  const cutoff = await configRepo.getNumber(
    'low_score_cut',
    Number(process.env.LOW_SCORE_CUT || 70),
  )
  const { 집계, flags } = calcAggregate(filledItems, llmOutput.위험플래그, cutoff)

  // 10. 최종 객체 조립
  const final: EvalOutput = {
    ...llmOutput,
    상담ID,
    평가메타: {
      평가주체: 'AI_1차',
      AI모델: process.env.LLM_MODEL ?? 'gemini-2.5-flash',
      루브릭버전: 'v1.5',
      // KST 고정 오프셋 표기 — DB evaluated_at(세션 tz +09:00의 DEFAULT CURRENT_TIMESTAMP)과
      // 벽시계가 일치하도록 UTC(Z)가 아닌 +09:00으로 기록. 실행 환경(Vercel=UTC)과 무관.
      평가일시: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '+09:00'),
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

  // 12. 저장 — MySQL (조회 정본)
  const persisted = await persistEvaluation(상담ID, utterances, final, {
    onConfirmedReview: options.onConfirmedReview,
    agentId: options.agentId,
    consultedAt: options.consultedAt,
    consultationType: options.consultationType,
    logVerification: options.logVerification,
  })
  options.onPersisted?.(persisted)
  if (persisted.unmatchedQuotes.length > 0) {
    console.warn(
      `⚠ 인용 원문대조 불일치 ${persisted.unmatchedQuotes.length}건:`,
      persisted.unmatchedQuotes,
    )
  }
  console.log(
    `✓ MySQL 저장 완료: consultation_id=${persisted.consultationId}, evaluation_id=${persisted.evaluationId}`,
  )

  // 13. 알림 — 불완전판매 의심 건만 INSERT (schema §7 ★v9).
  //     판정은 방금 저장된 상태라벨 값을 그대로 읽는다(채점·라벨 로직 불변).
  //     상태라벨 ENUM 우선순위(불완전판매 의심 > 저점수 — CLAUDE.md §8.3) 덕에
  //     이 단일 비교가 듀얼 라벨(불완전판매+저점수) 포함 / 저점수 단독 제외를
  //     정확히 가른다. INSERT 실패가 채점 저장을 막으면 안 되지만(저장은 이미
  //     완료) 조용히 삼키지도 않는다 — console.error로 크게 남긴다.
  if (final.집계.상태라벨 === '불완전판매 의심') {
    try {
      await createNotification(
        persisted.evaluationId,
        `불완전판매 의심 감지 — 상담 ${상담ID} (총점 ${final.집계.환산총점}점)`,
      )
    } catch (err) {
      console.error(
        `✗ 불완전판매 알림 INSERT 실패 (채점 저장은 완료됨): evaluation_id=${persisted.evaluationId}, 상담ID=${상담ID}`,
        err,
      )
    }
  }

  return final
}

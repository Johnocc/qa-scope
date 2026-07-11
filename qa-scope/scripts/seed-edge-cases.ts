/**
 * scripts/seed-edge-cases.ts — 화면① 계약 §4 엣지 케이스 재현용 시드
 *
 * 골든셋 7건에 없는 §10.4 필수 확인 케이스를 시드로 보강한다:
 *   "총점 ≥ 컷 + 위험플래그 3(오정보)만 있는 건"
 *   → status_labels ["정상"] 이면서 risk_flagged true (빨간 점 필수 — 초록불에 묻힘 방지)
 *
 * ⚠ 이 픽스처는 UI·계약 검증용 수기 데이터다. 골든셋(사람 손채점 7건)이 아니며
 *   골든셋 회귀(compare-golden)와 무관하다 — test/golden/에 절대 넣지 말 것.
 *   상담사는 'unknown'(미배정)으로 배정해 화면③ 결정 6(미배정 행 포함)도 함께 재현한다.
 *
 * 사용:  npx tsx scripts/seed-edge-cases.ts
 * 재실행 안전: 이미 있으면 상담은 재사용, 평가는 재채점 덮어쓰기 경로로 갱신.
 */
import 'dotenv/config'
import { ensureAgent } from '../lib/db/agentRepo.ts'
import * as consultations from '../lib/db/consultationRepo.ts'
import { persistEvaluation } from '../lib/db/persist.ts'
import { pool, query } from '../lib/db/pool.ts'
import * as configRepo from '../lib/db/configRepo.ts'
import { computeStatusLabels, DEFAULT_LOW_SCORE_CUT } from '../lib/db/statusLabels.ts'
import type { EvalOutput, Utterance } from '../lib/scoring/types.ts'

const CODE = 'edge_104' // §10.4에서 따온 이름 — 검증 대상 케이스임을 드러냄
const CONSULTED_AT = '2026-07-01 09:05:00'

/** 계약변경 콜 — U7에서 적용 시점 오안내(B1 오정보) 후 U9에서 정정 */
const UTTERANCES: Utterance[] = [
  { utteranceId: 'U1', 화자: '상담사', 타임스탬프: 0, 대화내용: '안녕하세요, 한빛생명 고객센터 상담사입니다. 무엇을 도와드릴까요?' },
  { utteranceId: 'U2', 화자: '고객', 타임스탬프: 6, 대화내용: '보험료 자동이체 출금 은행을 바꾸고 싶어서요. 서류도 이메일로 받고 싶고요.' },
  { utteranceId: 'U3', 화자: '상담사', 타임스탬프: 15, 대화내용: '네, 도와드리겠습니다. 본인 확인을 위해 성함과 생년월일 부탁드립니다.' },
  { utteranceId: 'U4', 화자: '고객', 타임스탬프: 24, 대화내용: '김하늘이고요, 1990년 8월 12일입니다.' },
  { utteranceId: 'U5', 화자: '상담사', 타임스탬프: 33, 대화내용: '확인 감사합니다. 자동이체 출금 은행을 변경하고, 안내 서류는 이메일 수령으로 바꾸고 싶으신 거죠?' },
  { utteranceId: 'U6', 화자: '고객', 타임스탬프: 41, 대화내용: '네 맞아요.' },
  { utteranceId: 'U7', 화자: '상담사', 타임스탬프: 50, 대화내용: '자동이체 은행 변경은 영업일 기준 7일 뒤부터 적용됩니다.' },
  { utteranceId: 'U8', 화자: '고객', 타임스탬프: 58, 대화내용: '7일이나 걸려요? 이번 달 납입일 전에는 바뀌어야 하는데요.' },
  { utteranceId: 'U9', 화자: '상담사', 타임스탬프: 67, 대화내용: '죄송합니다, 다시 확인해 보니 영업일 기준 3일 뒤부터 적용됩니다. 납입일 전에 적용되니 걱정하지 않으셔도 됩니다. 놀라셨겠어요.' },
  { utteranceId: 'U10', 화자: '고객', 타임스탬프: 75, 대화내용: '다행이네요. 감사합니다.' },
  { utteranceId: 'U11', 화자: '상담사', 타임스탬프: 82, 대화내용: '정리해 드리면 자동이체 출금 은행이 변경되어 영업일 3일 뒤부터 적용되고, 안내 서류는 이메일 수령으로 변경되었습니다. 더 도와드릴 것 없으실까요?' },
  { utteranceId: 'U12', 화자: '고객', 타임스탬프: 90, 대화내용: '없습니다.' },
  { utteranceId: 'U13', 화자: '상담사', 타임스탬프: 96, 대화내용: '이용해 주셔서 감사합니다. 추가 문의는 언제든 고객센터로 연락 주세요.' },
]

/** 획득점수·집계는 참고용 — saveFinalEvaluation이 코드로 재계산해 저장한다 */
const PAYLOAD: EvalOutput = {
  상담ID: CODE,
  평가메타: { 루브릭버전: 'v1.5', AI모델: 'edge-seed' },
  분류: {
    상담유형: '계약변경',
    유형근거: '기존 계약의 자동이체 출금 은행·서류 수령 방법 변경 요청.',
    권유유형: '없음',
    권유근거: '어떤 권유도 없음 → D영역 전체 N/A.',
  },
  판매정보: null,
  항목평가: [
    { 항목코드: 'A1', 충족수준: '충족', 배점: 4, 획득점수: 4, 근거: [{ 대화ID: 'U1', 인용문: '안녕하세요, 한빛생명 고객센터 상담사입니다.' }], 코멘트: '인사·소속 고지.' },
    { 항목코드: 'A2', 충족수준: '충족', 배점: 4, 획득점수: 4, 근거: [{ 대화ID: 'U3', 인용문: '본인 확인을 위해 성함과 생년월일 부탁드립니다.' }], 코멘트: '계약 변경 건 본인확인 수행.' },
    { 항목코드: 'A3', 충족수준: '충족', 배점: 4, 획득점수: 4, 근거: [{ 대화ID: 'U5', 인용문: '자동이체 출금 은행을 변경하고, 안내 서류는 이메일 수령으로 바꾸고 싶으신 거죠?' }], 코멘트: '용건 2건을 되물어 정확히 파악.' },
    { 항목코드: 'B1', 충족수준: '부분충족', 배점: 8, 획득점수: 4, 근거: [{ 대화ID: 'U7', 인용문: '자동이체 은행 변경은 영업일 기준 7일 뒤부터 적용됩니다.' }], 코멘트: '적용 시점 오안내(실제 3일) 후 고객 문의로 정정 — 오정보 발생, 위험플래그 3.' },
    { 항목코드: 'B2', 충족수준: '해당없음', 배점: 6, 획득점수: 0, 근거: [], 코멘트: '전문용어 사용 없음 → N/A.' },
    { 항목코드: 'B3', 충족수준: '충족', 배점: 6, 획득점수: 6, 근거: [{ 대화ID: 'U9', 인용문: '납입일 전에 적용되니 걱정하지 않으셔도 됩니다.' }], 코멘트: '고객 우려(납입일 전 적용)를 확인해 해소.' },
    { 항목코드: 'B4', 충족수준: '충족', 배점: 6, 획득점수: 6, 근거: [{ 대화ID: 'U11', 인용문: '자동이체 출금 은행이 변경되어 영업일 3일 뒤부터 적용되고' }], 코멘트: '두 요청을 지연·반복 없이 한 통화에 처리.' },
    { 항목코드: 'C1', 충족수준: '충족', 배점: 6, 획득점수: 6, 근거: [{ 대화ID: 'U9', 인용문: '놀라셨겠어요.' }], 코멘트: '오안내 정정 시 공감 표현.' },
    { 항목코드: 'C2', 충족수준: '충족', 배점: 6, 획득점수: 6, 근거: [{ 대화ID: 'U13', 인용문: '이용해 주셔서 감사합니다.' }], 코멘트: '경어·정중한 표현 일관.' },
    { 항목코드: 'C3', 충족수준: '해당없음', 배점: 6, 획득점수: 0, 근거: [], 코멘트: '고객 감정 표출 없음 → N/A.' },
    { 항목코드: 'D1', 충족수준: '해당없음', 배점: 7, 획득점수: 0, 근거: [], 코멘트: '권유 없음 → N/A.' },
    { 항목코드: 'D2', 충족수준: '해당없음', 배점: 5, 획득점수: 0, 근거: [], 코멘트: '권유 없음 → N/A.' },
    { 항목코드: 'D3', 충족수준: '해당없음', 배점: 5, 획득점수: 0, 근거: [], 코멘트: '권유 없음 → N/A.' },
    { 항목코드: 'D4', 충족수준: '해당없음', 배점: 4, 획득점수: 0, 근거: [], 코멘트: '권유 없음 → N/A.' },
    { 항목코드: 'D5', 충족수준: '해당없음', 배점: 4, 획득점수: 0, 근거: [], 코멘트: '권유 없음 → N/A.' },
    { 항목코드: 'D6', 충족수준: '해당없음', 배점: 5, 획득점수: 0, 근거: [], 코멘트: '어떤 권유도 없어 D6도 N/A.' },
    { 항목코드: 'E1', 충족수준: '충족', 배점: 7, 획득점수: 7, 근거: [{ 대화ID: 'U11', 인용문: '정리해 드리면 자동이체 출금 은행이 변경되어' }], 코멘트: '처리내용 요약·이해 점검.' },
    { 항목코드: 'E2', 충족수준: '충족', 배점: 7, 획득점수: 7, 근거: [{ 대화ID: 'U13', 인용문: '추가 문의는 언제든 고객센터로 연락 주세요.' }], 코멘트: '추가 채널 안내 + 정중한 종료.' },
  ],
  위험플래그: [
    { 규칙번호: 3, 관련항목코드: 'B1', 근거: '적용 시점을 영업일 7일로 오안내(실제 3일). 즉시 정정했으나 오정보 발생 — 규칙 3.' },
  ],
  // 참고용(코드 재계산 대상): 적용배점합 58(=100−B2 6−C3 6−D 30), 원점수합 54 → 93.1점
  집계: { 원점수합: 54, 적용배점합: 58, 환산총점: 93.1, 위험표시여부: true, 상태라벨: '정상' },
  고객만족: { 등급: '만족', 점수: null, 근거: '오안내가 있었으나 즉시 정정·해소되어 "다행이네요. 감사합니다"로 종료.' },
  요약: '자동이체 출금 은행·서류 수령 방법 변경 건. 적용 시점을 오안내(7일→실제 3일)했으나 즉시 정정 후 정상 처리. 권유 전무로 D영역 전체 N/A.',
  종합피드백: '규정 수치(적용 시점 등)는 안내 전 시스템 확인 습관이 필요합니다(B1 오정보 → 위험플래그 3). 요약·공감·마무리는 우수했습니다.',
}

async function main() {
  console.log(`§10.4 엣지 케이스 시드 — ${CODE} (총점≥컷 + 플래그 3만 → ["정상"] + 위험 점)\n`)

  await ensureAgent('unknown', '미배정')

  let existing = await consultations.findConsultation(CODE)
  if (!existing) {
    const consultationId = await consultations.createConsultation(
      {
        consultationCode: CODE,
        agentId: 'unknown', // 미배정 행(화면③ 결정 6)도 함께 재현
        customerId: 'CUST-EDGE-104',
        consultedAt: CONSULTED_AT,
        consultationType: null,
      },
      UTTERANCES.map((u, i) => ({
        turnOrder: i + 1,
        speaker: u.화자,
        spokenAt: `2026-07-01 09:0${Math.floor((5 * 60 + u.타임스탬프) / 60)}:${String(u.타임스탬프 % 60).padStart(2, '0')}`,
        offsetSec: u.타임스탬프,
        content: u.대화내용,
      })),
    )
    console.log(`✓ 상담 신규 적재 (id=${consultationId}, agent=unknown, 발화 ${UTTERANCES.length}건)`)
  } else {
    console.log(`✓ 상담 이미 존재 (id=${existing.consultation_id}) — 재사용`)
  }

  const { evaluationId, unmatchedQuotes } = await persistEvaluation(CODE, UTTERANCES, PAYLOAD)
  if (unmatchedQuotes.length > 0) {
    console.error('✗ 인용 원문대조 불일치 — 픽스처 인용문을 수정할 것:', unmatchedQuotes)
    await pool.end()
    process.exit(1)
  }
  console.log(`✓ 평가 적재 (evaluation_id=${evaluationId})`)

  // 저장 결과가 §10.4 기대와 맞는지 즉시 검증
  const rows = await query<{ final_score: number; risk_flagged: number; status_label: string }>(
    `SELECT m.final_score, m.risk_flagged, m.status_label
       FROM ai_evaluation_master m
       JOIN consultation_master c ON c.consultation_id = m.consultation_id
      WHERE c.consultation_code = ? AND m.evaluator = 'AI_최종'`,
    [CODE],
  )
  const saved = rows[0]
  const cut = await configRepo.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT)
  const labels = computeStatusLabels(saved.status_label, Number(saved.final_score), cut)
  const ok =
    Number(saved.final_score) >= cut &&
    Boolean(saved.risk_flagged) &&
    JSON.stringify(labels) === JSON.stringify(['정상'])

  console.log(
    `\n저장 결과: 총점 ${saved.final_score} (컷 ${cut}) · risk_flagged ${Boolean(saved.risk_flagged)} · status_labels ${JSON.stringify(labels)}`,
  )
  console.log(ok ? '✅ §10.4 케이스 재현 확인 — ["정상"] + 빨간 위험 점' : '❌ 기대와 다름 — 집계 로직 확인 필요')
  await pool.end()
  process.exit(ok ? 0 : 1)
}

main().catch(async (err) => {
  console.error('시드 실패:', err instanceof Error ? err.message : String(err))
  try {
    await pool.end()
  } catch {}
  process.exit(1)
})

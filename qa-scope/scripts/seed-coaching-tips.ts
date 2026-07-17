/**
 * scripts/seed-coaching-tips.ts — coaching_tips 테이블 시드 (18항목 전량)
 *
 * 정본 계약: scripts/schema.sql §5(★v7).
 * 데이터 출처: lib/db/agentReportRepo.ts의 COACHING_TIPS 상수를 그대로 복사
 * (문구 재해석·수정 금지 — 2026-07-16 확정본, 커밋 aa8e4d1).
 * import 대신 복사인 이유: agentReportRepo.ts의 COACHING_TIPS는 export되지
 * 않은 모듈 내부 상수이고, 이번 단계는 agentReportRepo.ts를 건드리지
 * 않기로 확정했다 (조회 코드 교체는 다음 단계).
 *
 * 사용:
 *   npm run db:seed-coaching-tips
 *
 * 동작:
 *   18개 항목코드(A1~E2) 전부를 upsertTip()으로 저장(ON DUPLICATE KEY UPDATE
 *   — 재실행 안전). 18건 중 하나라도 빠지면 아무것도 쓰지 않고 에러로
 *   중단한다(반쪽 시드 금지).
 */
import 'dotenv/config';
import { upsertTip } from '../lib/db/coachingTipsRepo.ts';
import { ITEM_CODES, type ItemCode } from '../lib/scoring/constants.ts';
import { pool } from '../lib/db/pool.ts';

// lib/db/agentReportRepo.ts COACHING_TIPS 그대로 복사 (2026-07-16 확정본, 커밋 aa8e4d1)
const COACHING_TIPS: Partial<Record<ItemCode, string>> = {
  A1: "첫인사에서 '한빛생명 상담사 ○○○입니다'처럼 소속·직함·이름을 함께 밝히세요. 직함(상담사)이 빠지면 감점 대상입니다.",
  A2: '상담을 진행하기 전에 성명·생년월일 등으로 본인확인 절차를 먼저 수행하세요.',
  A3: '고객의 용건과 핵심 니즈를 정확히 파악하세요. 불분명하면 되물어서라도 확인하는 것이 좋습니다.',
  B1: '상품·약관·절차 정보는 참조 문서와 일치하게 안내하세요. 확신이 없으면 추측하지 말고, 확인 후 다시 안내드리겠다고 약속하는 것이 정답입니다.',
  B2: '해지환급금·면책기간 같은 전문용어를 사용할 때는 바로 이어서 풀어 설명하세요.',
  B3: "'안 됩니다'에서 끝내지 말고, 가능한 대안이나 고객이 취할 수 있는 다음 단계를 함께 제시하세요.",
  B4: '통화 보류가 필요하면 반드시 사전에 양해를 구하고, 이미 안내한 내용을 불필요하게 반복하지 않도록 하세요.',
  C1: '고객이 상황이나 감정을 이야기하면 적절한 시점에 공감을 표현하세요. 단순한 맞장구보다는 고객의 상황을 구체적으로 짚는 공감 멘트가 좋습니다.',
  C2: '경어를 일관되게 사용하고, 부정적이거나 명령형 표현은 피하세요. 고객 호칭도 상황에 맞게 사용하세요.',
  C3: '고객이 불만이나 화난 감정을 표출하면 사과→공감→해결 순서로 대응하세요. 맞대응하거나 방어적인 태도를 보이지 않도록 주의하세요.',
  D1: '상품을 권유할 때는 보장내용·보험료·보험기간·해지환급금(원금 손실 가능성) 4가지를 빠짐없이 설명하세요. 보장내용은 진단비·수술비 같은 세부 범주까지 안내해야 합니다.',
  D2: '상품을 권유하기 전에 고객의 가입목적·재정상황·기존계약 3가지를 확인하고, 확인한 내용에 맞는 상품을 권유하세요.',
  D3: '가입 상담 시 계약자의 고지의무(병력 등)와 위반 시 불이익(계약 해지·보험금 부지급 가능성)을 함께 안내하세요.',
  D4: "보험금이 지급되지 않는 경우(면책기간·부지급 사유)를 설명하세요. '별로 신경 안 쓰셔도 돼요'처럼 중요성을 축소하는 표현은 피해야 합니다.",
  D5: '청약 시 청약철회 가능 기간과 해피콜 절차를 안내하세요.',
  D6: "'무조건', '원금 보장', '손해 없다' 같은 단정적·과장 표현은 사용하지 마세요. 기존 계약을 해지시키고 갈아타게 하는 승환 권유 강요도 금지 대상입니다.",
  E1: "상담을 마치기 전에 처리 내용을 요약해 드리고, '더 궁금하신 점 없으실까요?'처럼 고객의 이해 여부를 확인하세요.",
  E2: "추가 문의가 가능한 채널(고객센터, 홈페이지 채팅 등)을 특정해서 안내하고, 정중한 종료 인사로 마무리하세요. '연락 주세요'처럼 채널 없이 끝내면 부족합니다.",
};

async function main() {
  const entries = Object.entries(COACHING_TIPS) as [ItemCode, string][];
  const missing = ITEM_CODES.filter((code) => !(code in COACHING_TIPS));

  if (missing.length > 0 || entries.length !== ITEM_CODES.length) {
    console.error(
      `[db:seed-coaching-tips] 실패: 18개 항목 중 ${missing.length}개 누락(${missing.join(', ') || '개수 불일치'}).\n` +
        '  전부 갖춰야 시드합니다(반쪽 시드 금지).',
    );
    process.exit(1);
  }

  for (const [itemCode, tipText] of entries) {
    await upsertTip(itemCode, tipText);
  }

  console.log(`[db:seed-coaching-tips] 코칭 팁 시드 완료 — ${entries.length}건 (A1~E2 전량)`);
}

main()
  .catch((err) => {
    console.error('[db:seed-coaching-tips] 실패:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

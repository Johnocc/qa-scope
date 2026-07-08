import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

type Level = '충족' | '부분충족' | '미충족' | '해당없음'
const VALID: Level[] = ['충족', '부분충족', '미충족', '해당없음']
const ORDER: Record<Level, number> = { 충족: 3, 부분충족: 2, 미충족: 1, 해당없음: 0 }

function normalize(raw: string): Level | '대조불가' {
  if (raw === 'N/A' || raw === '해당없음') return '해당없음'
  if ((VALID as string[]).includes(raw)) return raw as Level
  return '대조불가'
}

function mismatchType(a: Level, b: Level): '완전뒤집힘' | '한칸차이' {
  return Math.abs(ORDER[a] - ORDER[b]) >= 2 ? '완전뒤집힘' : '한칸차이'
}

const root = process.cwd()
const golden = JSON.parse(readFileSync(join(root, 'test/golden/golden_set.json'), 'utf-8'))

const goldenMap = new Map<number, Map<string, string>>()
for (const c of golden.cases) {
  const num = parseInt((c.case_id as string).replace('#', ''))
  const items = new Map<string, string>()
  for (const item of c.items) items.set(item.item_id as string, item.consensus as string)
  goldenMap.set(num, items)
}

const outputsDir = join(root, 'outputs')
const files = readdirSync(outputsDir)
  .filter((f) => /^dummy_0[1-7]\.json$/.test(f))
  .sort()

if (files.length === 0) {
  console.error('outputs/ 에 dummy_01~07.json 파일이 없습니다.')
  process.exitCode = 1
  process.exit()
}

type Mismatch = {
  case: string
  item: string
  human: string
  ai: string
  type: '완전뒤집힘' | '한칸차이'
}

const ITEM_ORDER = [
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6',
  'E1', 'E2',
]
const itemStat = new Map<string, { match: number; total: number }>()
for (const id of ITEM_ORDER) itemStat.set(id, { match: 0, total: 0 })

const caseRows: { label: string; match: number; total: number }[] = []
const mismatches: Mismatch[] = []
const warnings: string[] = []
let totalMatch = 0
let totalItems = 0

for (const file of files) {
  const m = file.match(/dummy_0(\d)\.json/)
  if (!m) continue
  const caseNum = parseInt(m[1])
  const caseLabel = `#${caseNum}`

  const aiData = JSON.parse(readFileSync(join(outputsDir, file), 'utf-8'))
  const aiItems: { 항목코드: string; 충족수준: string }[] = aiData.항목평가

  if (aiItems.length !== 18) {
    warnings.push(`⚠ ${file}: 항목 ${aiItems.length}개 (18개 예상)`)
  }

  const humanMap = goldenMap.get(caseNum)
  if (!humanMap) {
    warnings.push(`⚠ ${caseLabel}: 골든셋에 없는 케이스`)
    continue
  }

  let caseMatch = 0
  let caseTotal = 0

  for (const ai of aiItems) {
    const id = ai.항목코드
    const rawHuman = humanMap.get(id)
    if (rawHuman === undefined) {
      warnings.push(`⚠ ${caseLabel} ${id}: 골든셋에 없는 항목`)
      continue
    }

    const human = normalize(rawHuman)
    const aiLevel = normalize(ai.충족수준)

    if (human === '대조불가') {
      warnings.push(`⚠ ${caseLabel} ${id}: 골든셋 값 "${rawHuman}" 대조불가`)
      continue
    }
    if (aiLevel === '대조불가') {
      warnings.push(`⚠ ${caseLabel} ${id}: AI 값 "${ai.충족수준}" 대조불가`)
      continue
    }

    caseTotal++
    totalItems++
    const stat = itemStat.get(id)!
    stat.total++

    if (human === aiLevel) {
      caseMatch++
      totalMatch++
      stat.match++
    } else {
      mismatches.push({
        case: caseLabel,
        item: id,
        human,
        ai: aiLevel,
        type: mismatchType(human, aiLevel),
      })
    }
  }

  caseRows.push({ label: caseLabel, match: caseMatch, total: caseTotal })
}

const pct = (n: number, d: number): string =>
  d === 0 ? 'N/A' : `${(Math.round((n / d) * 1000) / 10).toFixed(1)}%`

const pass = totalItems > 0 && totalMatch / totalItems >= 0.8

console.log('=======================================================')
console.log('  골든셋 회귀 대조 리포트')
console.log('=======================================================')
console.log()
console.log(
  `[전체 일치율]  ${totalMatch} / ${totalItems}  =  ${pct(totalMatch, totalItems)}  ${pass ? '✅ 80% 달성' : '❌ 80% 미달'}`
)
console.log()

console.log('[케이스별 일치율]')
for (const r of caseRows) {
  console.log(`  ${r.label}   ${r.match} / ${r.total}  (${pct(r.match, r.total)})`)
}
console.log()

console.log('[항목별 일치율 (7건 중)]')
for (const id of ITEM_ORDER) {
  const s = itemStat.get(id)!
  const ratio = s.total > 0 ? s.match / s.total : 1
  const mark = s.match === s.total ? 'O' : ratio >= 0.7 ? '-' : 'X'
  console.log(`  [${mark}] ${id.padEnd(3)}  ${s.match} / ${s.total}  (${pct(s.match, s.total)})`)
}
console.log()

if (mismatches.length === 0) {
  console.log('[불일치 목록]  없음')
} else {
  console.log(`[불일치 목록]  총 ${mismatches.length}건`)
  console.log()
  console.log(`  케이스  항목  사람 판정     AI 판정       분류`)
  console.log(`  ------  ----  ----------    ----------    ---------`)
  for (const mis of mismatches) {
    console.log(
      `  ${mis.case.padEnd(6)}  ${mis.item.padEnd(4)}  ${mis.human.padEnd(10)}    ${mis.ai.padEnd(10)}    ${mis.type}`
    )
  }
}
console.log()

if (warnings.length > 0) {
  console.log('[경고]')
  for (const w of warnings) console.log(`  ${w}`)
  console.log()
}

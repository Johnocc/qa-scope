import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTranscript } from '../lib/scoring/parse.ts'

const raw = readFileSync(
  join(process.cwd(), 'test/golden/transcripts/dummy_01.txt'),
  'utf-8'
)

const { utterances, droppedLines } = parseTranscript(raw)

// ① 총 발화 수
console.log(`총 발화 수: ${utterances.length}`)

// ② 화자별 개수
const speakerCount: Record<string, number> = {}
for (const u of utterances) {
  speakerCount[u.화자] = (speakerCount[u.화자] ?? 0) + 1
}
for (const [speaker, count] of Object.entries(speakerCount)) {
  console.log(`  ${speaker}: ${count}건`)
}

// ③ droppedLines
console.log(`\ndroppedLines: ${droppedLines.length}건`)
for (const d of droppedLines) {
  console.log(`  [L${d.lineNo}] ${d.text}`)
}

// ④ 첫·마지막 발화 원문
const first = utterances[0]
const last = utterances[utterances.length - 1]
console.log(`\n첫 발화 [${first.utteranceId}] ${first.화자} (${first.타임스탬프}초)`)
console.log(`  "${first.대화내용}"`)
console.log(`\n마지막 발화 [${last.utteranceId}] ${last.화자} (${last.타임스탬프}초)`)
console.log(`  "${last.대화내용}"`)

import 'dotenv/config'
import { readFileSync } from 'fs'
import { indexPolicyDocument } from '../lib/rag/indexPolicy.ts'

const COLLECTION_NAME = 'policy_v2'
const POLICY_PATH = 'docs/rag/한빛생명_가상약관_v2.0.md'

;(async () => {
  const content = readFileSync(POLICY_PATH, 'utf-8')
  const count = await indexPolicyDocument(content, COLLECTION_NAME)
  console.log(`저장 완료. collection 총 개수: ${count}`) // 22 기대
})()

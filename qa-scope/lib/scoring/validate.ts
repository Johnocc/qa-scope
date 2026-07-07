// .js 확장자 필수 — Next(webpack)와 Node 네이티브 ESM(strip-types 스크립트) 양쪽 호환
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { join } from 'path'

// allowUnionTypes: 스키마 ver2가 type: ["string","null"] 등 union을 정당하게 사용
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true })
addFormats(ajv)

const schema = JSON.parse(
  readFileSync(join(process.cwd(), 'schemas', 'eval-output.ver2.json'), 'utf-8')
)
const validate = ajv.compile(schema)

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: NonNullable<typeof validate.errors> }

export function validateOutput(data: unknown): ValidationResult {
  const ok = validate(data)
  if (ok) return { valid: true }
  return { valid: false, errors: validate.errors! }
}

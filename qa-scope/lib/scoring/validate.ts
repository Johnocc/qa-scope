import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { join } from 'path'

const ajv = new Ajv2020({ allErrors: true })
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

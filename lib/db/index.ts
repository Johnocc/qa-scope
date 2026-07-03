/**
 * lib/db/index.ts — DB 어댑터 단일 진입점.
 * Next.js API 라우트/파이프라인에서:
 *   import db from '@/lib/db';
 *   await db.evaluations.saveFinalEvaluation(...)
 *
 * 편의상 scoring(검증·집계)도 함께 노출. 정본은 lib/scoring/ 이며 여기선 재노출만.
 */
import { pool, query, withTransaction } from './pool';
import * as consultations from './consultationRepo';
import * as evaluations from './evaluationRepo';
import * as verifyLog from './verifyLogRepo';
import * as config from './configRepo';
import * as scoring from '../scoring/scoring';
import * as constants from '../scoring/constants';

const db = {
  pool, query, withTransaction,
  consultations, evaluations, verifyLog, config,
  scoring, constants,
};

export default db;
export {
  pool, query, withTransaction,
  consultations, evaluations, verifyLog, config,
  scoring, constants,
};

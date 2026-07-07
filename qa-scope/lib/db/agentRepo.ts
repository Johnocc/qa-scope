/**
 * lib/db/agentRepo.ts — 테이블 0. agents (상담사 마스터, v3 신설)
 *
 * 화면③(대시보드)·④(개인 리포트)의 상담사명 공급 + FK 안전망.
 * consultation_master.agent_id가 agents FK가 되었으므로, 상담을 만들 수 있는
 * 모든 경로(seed·persist)는 INSERT 전에 ensureAgent/upsertAgents로 명부를 보장한다.
 */
import { query } from './pool'

export interface AgentRow {
  agent_id: string
  agent_name: string
  team_name: string | null
  is_active: number
  /** pool.ts dateStrings:true — 'YYYY-MM-DD HH:MM:SS' 문자열로 수신 */
  created_at: string
}

export interface AgentInput {
  agentId: string
  agentName: string
  teamName?: string | null
  isActive?: boolean
}

/**
 * 명부 일괄 갱신 (seed용) — 이미 있으면 이름·팀·재직 상태를 새 값으로 덮어쓴다.
 * (seed.ts의 "메타데이터는 갱신" 규약과 동일. schema.sql 시드는 반대로 보존 규약)
 */
export async function upsertAgents(rows: AgentInput[]): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map((r) => [
    r.agentId,
    r.agentName,
    r.teamName ?? null,
    r.isActive === false ? 0 : 1,
  ])
  await query(
    `INSERT INTO agents (agent_id, agent_name, team_name, is_active)
     VALUES ? AS new
     ON DUPLICATE KEY UPDATE
       agent_name = new.agent_name,
       team_name  = new.team_name,
       is_active  = new.is_active`,
    [values] as any,
  )
}

/**
 * 명부 보장 (FK 안전망) — 없을 때만 등록, 있으면 건드리지 않는다.
 * 이름을 모르면 agent_id를 임시 이름으로 쓴다 (schema.sql 백필과 동일 규칙).
 */
export async function ensureAgent(agentId: string, agentName?: string): Promise<void> {
  await query(
    `INSERT IGNORE INTO agents (agent_id, agent_name) VALUES (?, ?)`,
    [agentId, agentName ?? agentId],
  )
}

/** 상담사 1명 조회 — 화면④ API의 404 판정·헤더(agent_name)용 */
export async function getAgent(agentId: string): Promise<AgentRow | null> {
  const rows = await query<AgentRow>(`SELECT * FROM agents WHERE agent_id = ?`, [agentId])
  return rows[0] ?? null
}

/** 명부 목록 — 화면③ 표·팀 순위 분모용. 미배정(unknown)은 제외 */
export async function listAgents(opts: { activeOnly?: boolean } = {}): Promise<AgentRow[]> {
  const where = opts.activeOnly ? `AND is_active = 1` : ''
  return query<AgentRow>(
    `SELECT * FROM agents WHERE agent_id <> 'unknown' ${where} ORDER BY agent_id`,
  )
}

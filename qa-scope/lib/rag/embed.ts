// lib/rag/embed.ts
// 임베딩 전담 모듈 — 텍스트를 gemini-embedding-001 벡터로 변환.
// 채점 LLM(lib/llm)과 분리 유지: 나중에 채점을 Claude로 바꿔도 임베딩은 Gemini.
// SDK는 채점과 동일한 신 SDK(@google/genai) 사용.

import { GoogleGenAI } from '@google/genai'

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

const EMBED_MODEL = 'gemini-embedding-001'
const EMBED_DIMENSIONS = 3072 // chroma collection 차원과 반드시 일치해야 함

function normalize(vec: number[]): number[] {
  let sumSq = 0
  for (const v of vec) sumSq += v * v
  const norm = Math.sqrt(sumSq)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

export async function embedText(text: string, taskType: EmbedTaskType): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set')

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { taskType, outputDimensionality: EMBED_DIMENSIONS },
  })

  const values = response.embeddings?.[0]?.values
  if (!values || values.length === 0) {
    throw new Error('임베딩 응답이 비었습니다(embedContent returned empty)')
  }
  if (values.length !== EMBED_DIMENSIONS) {
    throw new Error(`임베딩 차원 불일치: ${values.length} (기대값 ${EMBED_DIMENSIONS})`)
  }
  return normalize(values)
}

import type { Utterance } from './types'

export type ParseResult = {
  utterances: Utterance[]
  droppedLines: { lineNo: number; text: string }[]
}

const UTTERANCE_LINE = /^\[(\d{2}):(\d{2})\]\s+(.+?):\s+(.+)/

function isValidSpeaker(s: string): s is '상담사' | '고객' {
  return s === '상담사' || s === '고객'
}

export function parseTranscript(rawText: string): ParseResult {
  const lines = rawText.split('\n')
  const utterances: Utterance[] = []
  const droppedLines: { lineNo: number; text: string }[] = []

  let pendingSpeaker: '상담사' | '고객' | null = null
  let pendingTs = 0
  let pendingContent = ''
  let hasPending = false

  function flush() {
    if (!hasPending || pendingSpeaker === null) return
    const idx = String(utterances.length + 1).padStart(2, '0')
    utterances.push({
      utteranceId: `U${idx}`,
      화자: pendingSpeaker,
      타임스탬프: pendingTs,
      대화내용: pendingContent.trim(),
    })
    hasPending = false
    pendingSpeaker = null
    pendingContent = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const line = lines[i]
    const m = line.match(UTTERANCE_LINE)

    if (m) {
      flush()
      const [, mm, ss, speaker, content] = m
      const trimmedSpeaker = speaker.trim()

      if (!isValidSpeaker(trimmedSpeaker)) {
        droppedLines.push({ lineNo, text: line })
        continue
      }

      pendingSpeaker = trimmedSpeaker
      pendingTs = parseInt(mm, 10) * 60 + parseInt(ss, 10)
      pendingContent = content.trim()
      hasPending = true
    } else if (line.trim() === '') {
      // 빈 행: 건너뜀
    } else if (line.startsWith(' ') || line.startsWith('\t')) {
      if (hasPending) {
        pendingContent += ' ' + line.trim()
      } else {
        droppedLines.push({ lineNo, text: line })
      }
    } else {
      droppedLines.push({ lineNo, text: line })
    }
  }

  flush()
  return { utterances, droppedLines }
}

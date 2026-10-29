import type { PatternScoreRecord } from './adaptive-recommendations'
const KEY = 'lucky45.patternScores.v3'
export function readPatternCache(): PatternScoreRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((r): r is PatternScoreRecord => r && Number.isInteger(r.round) && typeof r.signature === 'string' && typeof r.score === 'number' && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100) : []
  } catch { return [] }
}
export function savePatternCache(records: PatternScoreRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(records)) } catch { /* 캐시 저장 실패는 추천 생성을 막지 않는다. */ }
}

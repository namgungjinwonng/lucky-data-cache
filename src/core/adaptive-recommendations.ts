import { createAnalysisModel, toRanked, type Candidate, type RankedCombination } from './analysis'
import { selectDispersion } from './dispersion'
import type { HistoricalDraw } from './history-data'
import seedScores from './pattern-seed.json'

// 점수 정의는 버전 3의 표시 점수 그대로 유지한다. 추천 선택 방식의 버전과 구분한다.
export const PATTERN_SCORE_VERSION = 3
export const RECENT_WINDOW = 26
export const GAME_COUNT = 10
// 21~1,251회 당첨번호의 70.5%가 이 구간이었다. 구간을 고르는 것은 게임당 당첨확률을 바꾸지 않는다.
export const SCORE_MIN = 40
export const SCORE_MAX = 65
export interface PatternScoreRecord { round: number; score: number; signature: string }
export interface AdaptiveRecommendation {
  games: RankedCombination[]
  scores: PatternScoreRecord[]
  /** 알고 있는 모든 회차(시드 + 최근 계산) 중 당첨번호 점수가 구간 안이었던 비율 */
  bandShare: number
  recentInBand: number
  recentRounds: number
  sourceRound: number
}
export type PopularityReason = 'allLow' | 'sameRow' | 'carryover' | 'pastFirst'

export const inScoreBand = (score: number) => score >= SCORE_MIN && score < SCORE_MAX

// 많은 사람이 고르는 모양을 제외해 1~3등 당첨 시 나눠 가질 사람 수를 줄인다. 당첨확률과는 무관하다.
export function popularityReasons(numbers: readonly number[], lastNumbers: readonly number[], pastFirsts: ReadonlySet<string>): PopularityReason[] {
  const reasons: PopularityReason[] = []
  // 생일·날짜에 쓰이는 1~31만으로 된 조합
  if (Math.max(...numbers) <= 31) reasons.push('allLow')
  // 7칸 용지의 한 가로줄에 4개 이상 몰린 조합
  const rows = numbers.map((n) => Math.floor((n - 1) / 7))
  if (rows.some((row) => rows.filter((r) => r === row).length >= 4)) reasons.push('sameRow')
  if (numbers.filter((n) => lastNumbers.includes(n)).length >= 3) reasons.push('carryover')
  if (pastFirsts.has([...numbers].sort((a, b) => a - b).join('-'))) reasons.push('pastFirst')
  return reasons
}

export async function trainingSignature(draws: HistoricalDraw[]) {
  const input = JSON.stringify(draws.map(d => [d.round, d.numbers]))
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}

export async function recentPatternScores(draws: HistoricalDraw[], cache: readonly PatternScoreRecord[] = []) {
  const ascending = [...draws].sort((a, b) => a.round - b.round)
  const cached = new Map<number, PatternScoreRecord>([...seedScores, ...cache].map(r => [r.round, r]))
  const records: PatternScoreRecord[] = []
  for (let i = Math.max(20, ascending.length - RECENT_WINDOW); i < ascending.length; i++) {
    const draw = ascending[i], past = ascending.slice(0, i)
    // 대상 당첨번호까지 포함한 해시로 과거 데이터 정정과 대상 번호 변경 모두 감지한다.
    const signature = await trainingSignature(ascending.slice(0, i + 1))
    const saved = cached.get(draw.round)
    if (saved?.signature === signature && Number.isFinite(saved.score) && saved.score >= 0 && saved.score <= 100) {
      records.push(saved)
    } else {
      const model = createAnalysisModel(past, 30_000)
      records.push({ round: draw.round, signature, score: toRanked([model.scoreNumbers(draw.numbers)], model.mean, model.deviation)[0].score })
    }
  }
  return records
}

function randomForRound(round: number) {
  let state = (round * 524_287 + 88_601) >>> 0
  return () => {
    state += 0x6d2b79f5
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296
  }
}

export async function buildAdaptiveRecommendations(
  draws: HistoricalDraw[], cache: readonly PatternScoreRecord[] = [], avoidPopular = true,
): Promise<AdaptiveRecommendation> {
  const ascending = [...draws].sort((a, b) => a.round - b.round)
  const scores = await recentPatternScores(ascending, cache)
  const model = createAnalysisModel(ascending, 30_000)
  const scoreOf = new Map<Candidate, number>(toRanked(model.candidates, model.mean, model.deviation).map((r, i) => [model.candidates[i], r.score]))
  const candidates = model.candidates.filter(c => inScoreBand(scoreOf.get(c)!))
  const last = ascending.at(-1)!
  const pastFirsts = new Set(ascending.map(d => [...d.numbers].sort((a, b) => a - b).join('-')))
  // 후보를 미리 빼면 분산 선택의 표본 간격이 바뀌므로, 선택 단계에서만 제외한다.
  // 그래서 제외 대상이 뽑히지 않는 회차는 필터가 없을 때와 같은 10게임이 나온다.
  const chosen = selectDispersion(candidates, [], randomForRound(last.round + 1), GAME_COUNT,
    avoidPopular ? (c) => popularityReasons(c.numbers, last.numbers, pastFirsts).length === 0 : undefined)
  chosen.sort((a, b) => b.rawScore - a.rawScore)

  const known = new Map<number, number>(seedScores.filter(r => r.round <= last.round).map(r => [r.round, r.score]))
  scores.forEach(r => known.set(r.round, r.score))
  const knownScores = [...known.values()]
  return {
    games: toRanked(chosen, model.mean, model.deviation),
    scores,
    bandShare: knownScores.filter(inScoreBand).length / Math.max(1, knownScores.length),
    recentInBand: scores.filter(r => inScoreBand(r.score)).length,
    recentRounds: scores.length,
    sourceRound: last.round,
  }
}

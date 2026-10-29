import { createAnalysisModel, toRanked, type Candidate, type RecommendationSets } from './analysis'
import { selectDispersion } from './dispersion'
import type { HistoricalDraw } from './history-data'
import seedScores from './pattern-seed.json'

// 점수 정의는 버전 3의 표시 점수 그대로 유지한다. 추천 배분 버전과 구분한다.
export const PATTERN_SCORE_VERSION = 3
export const BASE_SHARES = [0, 0, .05, .15, .30, .30, .15, .05, 0, 0] as const
export const RECENT_WINDOW = 26
export const RECENT_INFLUENCE = .20
export interface PatternScoreRecord { round: number; score: number; signature: string }
export interface ScoreAllocation { bin: number; baseCount: number; count: number; share: number }
export interface AdaptiveRecommendation {
  sets: RecommendationSets
  allocation: ScoreAllocation[]
  scores: PatternScoreRecord[]
  recentRounds: number
  sourceRound: number
}
export const scoreBin = (score: number) => Math.min(9, Math.max(0, Math.floor(score / 10)))

export function allocateGames(shares: readonly number[], total = 20) {
  const sum = shares.reduce((a, b) => a + b, 0)
  if (sum <= 0 || shares.some(x => !Number.isFinite(x) || x < 0)) throw new Error('잘못된 점수 구간 비율입니다.')
  const exact = shares.map(p => p / sum * total)
  const counts = exact.map(Math.floor)
  const order = exact.map((p, i) => ({ i, remainder: p - counts[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i)
  const remaining = total - counts.reduce((a, b) => a + b, 0)
  for (let i = 0; i < remaining; i++) counts[order[i].i]++
  return counts
}

export function makeAllocation(scores: readonly Pick<PatternScoreRecord, 'round' | 'score'>[]) {
  const recent = [...scores].sort((a, b) => b.round - a.round).slice(0, RECENT_WINDOW)
  const observed = Array(10).fill(0) as number[]
  recent.forEach(r => observed[scoreBin(r.score)]++)
  const weight = RECENT_INFLUENCE * Math.min(1, recent.length / RECENT_WINDOW)
  const shares = BASE_SHARES.map((base, bin) => base * (1 - weight) + (recent.length ? observed[bin] / recent.length : base) * weight)
  const counts = allocateGames(shares)
  const baseCounts = allocateGames(BASE_SHARES)
  return shares.map((share, bin) => ({ bin, share, count: counts[bin], baseCount: baseCounts[bin] }))
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

export async function buildAdaptiveRecommendations(draws: HistoricalDraw[], cache: readonly PatternScoreRecord[] = []): Promise<AdaptiveRecommendation> {
  const scores = await recentPatternScores(draws, cache)
  const allocation = makeAllocation(scores)
  const model = createAnalysisModel(draws, 30_000)
  const buckets: Candidate[][] = Array.from({ length: 10 }, () => [])
  const bins = new Map<Candidate, number>()
  const binOf = (c: Candidate) => {
    const bin = bins.get(c) ?? scoreBin(toRanked([c], model.mean, model.deviation)[0].score)
    bins.set(c, bin)
    return bin
  }
  model.candidates.forEach(c => buckets[binOf(c)].push(c))
  // 구간 안에서도 고득점 끝에 몰리지 않도록 전체 구간에서 고르게 후보를 뽑는다.
  const candidates = buckets.flatMap((bucket, bin) => !allocation[bin].count ? [] : Array.from(
    { length: Math.min(200, bucket.length) }, (_, i) => bucket[Math.floor(i * bucket.length / Math.min(200, bucket.length))],
  ))
  const sourceRound = Math.max(...draws.map(d => d.round))
  const chosen = selectDispersion(candidates, [], randomForRound(sourceRound + 1), 20, (c, selected) =>
    selected.filter(g => binOf(g) === binOf(c)).length < allocation[binOf(c)].count,
  )
  chosen.sort((a, b) => binOf(a) - binOf(b) || a.rawScore - b.rawScore)
  const ranked = toRanked(chosen, model.mean, model.deviation)
  // 기존 저장 인터페이스의 두 묶음은 화면상의 1~10 / 11~20게임이다.
  return { sets: { top: ranked.slice(0, 10), dispersion: ranked.slice(10) }, allocation, scores, recentRounds: scores.length, sourceRound }
}

// 회차별 추천 조합 스냅샷을 기기에 보존하고 공식 당첨 결과와 대조하는 모듈
import { ALGORITHM_VERSION, type RankedCombination, type RecommendationSets } from './analysis'
import type { HistoricalDraw, PrizeAmounts } from './history-data'

// bottom/mixed는 이전 버전의 저장 기록을 그대로 읽기 위해 유지한다.
export type RecommendationCategory = 'top' | 'bottom' | 'mixed' | 'dispersion'

export interface SavedRecommendationGame {
  category: RecommendationCategory
  index: number
  numbers: number[]
  score: number
}

export interface RecommendationSnapshot {
  targetRound: number
  sourceRound: number
  generatedAt: string
  kind: 'live' | 'backtest' | 'legacy'
  /** 없으면 이월 비중 도입 전 버전 1 */
  algorithmVersion?: number
  games: SavedRecommendationGame[]
}

export interface GameOutcome extends SavedRecommendationGame {
  rank: 1 | 2 | 3 | 4 | 5 | null
  prize: number | null
  matchCount: number | null
  bonusMatched: boolean
}

export interface RecommendationRoundOutcome {
  snapshot: RecommendationSnapshot
  draw: HistoricalDraw | null
  games: GameOutcome[]
  totalPrize: number
}

const STORAGE_KEY = 'lucky45.recommendationHistory.v1'

// 1,244회 당시 앱이 제공한 상위 10게임(1,243회까지의 데이터, 알고리즘 버전 1)을 고정 보관한다.
const LEGACY_1244_TOP: [number[], number][] = [
  [[13, 18, 21, 31, 34, 38], 90.2],
  [[11, 13, 16, 31, 34, 44], 90.2],
  [[13, 18, 20, 27, 31, 34], 89.4],
  [[7, 13, 16, 31, 38, 40], 89.1],
  [[11, 13, 20, 31, 34, 38], 89],
  [[12, 13, 18, 24, 27, 31], 88.8],
  [[12, 13, 18, 24, 37, 38], 88.2],
  [[4, 15, 18, 27, 31, 38], 87.8],
  [[7, 13, 18, 34, 38, 45], 86.9],
  [[13, 15, 18, 28, 38, 45], 86.8],
]

export function createLegacy1244Snapshot(generatedAt = new Date().toISOString()): RecommendationSnapshot {
  return {
    targetRound: 1244,
    sourceRound: 1243,
    generatedAt,
    kind: 'legacy',
    algorithmVersion: 1,
    games: LEGACY_1244_TOP.map(([numbers, score], index) => ({ category: 'top', index: index + 1, numbers: [...numbers], score })),
  }
}

function isNumberSet(numbers: unknown): numbers is number[] {
  return Array.isArray(numbers) && numbers.length === 6 && new Set(numbers).size === 6 && numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45)
}

function isSnapshot(value: unknown): value is RecommendationSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<RecommendationSnapshot>
  const kind = snapshot.kind ?? 'live'
  const expectedGameCount = kind === 'legacy' ? 10 : 20
  return Number.isInteger(snapshot.targetRound) && Number.isInteger(snapshot.sourceRound) && typeof snapshot.generatedAt === 'string' && ['live', 'backtest', 'legacy'].includes(kind) && Array.isArray(snapshot.games)
    && snapshot.games.length === expectedGameCount && snapshot.games.every((game) =>
      ['top', 'bottom', 'mixed', 'dispersion'].includes(game.category) && Number.isInteger(game.index) && isNumberSet(game.numbers) && typeof game.score === 'number',
    )
}

function toGames(category: RecommendationCategory, combinations: RankedCombination[]): SavedRecommendationGame[] {
  return combinations.map((combination, index) => ({
    category,
    index: index + 1,
    numbers: [...combination.numbers],
    score: combination.score,
  }))
}

export function createRecommendationSnapshot(sets: RecommendationSets, targetRound: number, sourceRound: number, generatedAt = new Date().toISOString(), kind: RecommendationSnapshot['kind'] = 'live'): RecommendationSnapshot {
  return {
    targetRound,
    sourceRound,
    generatedAt,
    kind,
    algorithmVersion: ALGORITHM_VERSION,
    games: [
      ...toGames('top', sets.top),
      ...toGames('dispersion', sets.dispersion),
    ],
  }
}

export function readRecommendationHistory(storage: Pick<Storage, 'getItem'> = localStorage): RecommendationSnapshot[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(isSnapshot).sort((a, b) => b.targetRound - a.targetRound)
  } catch {
    return []
  }
}

export interface RecommendationSaveContext {
  latestRound: number
  sourceDate: string
  now?: number
}

// 기록 보존을 위해 다음 회차 날짜의 20시(KST)에 추천 교체를 마감한다.
// 오래된 오프라인 캐시를 '미래 회차'로 잘못 판단하여 과거 결과를 바꾸지 않는다.
export function isRecommendationOpen(snapshot: Pick<RecommendationSnapshot, 'kind' | 'sourceRound' | 'targetRound'>, context: RecommendationSaveContext) {
  if (snapshot.kind !== 'live' || snapshot.sourceRound !== context.latestRound || snapshot.targetRound !== snapshot.sourceRound + 1) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.sourceDate)) return false
  const sourceDay = Date.parse(`${context.sourceDate}T00:00:00Z`)
  if (!Number.isFinite(sourceDay) || new Date(sourceDay).toISOString().slice(0, 10) !== context.sourceDate) return false
  const cutoff = sourceDay + 7 * 86_400_000 + 11 * 3_600_000
  return (context.now ?? Date.now()) < cutoff
}

export function saveRecommendationSnapshot(snapshot: RecommendationSnapshot, context: RecommendationSaveContext, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const history = readRecommendationHistory(storage)
  if (!isRecommendationOpen(snapshot, context)) return history
  const existing = history.find((item) => item.targetRound === snapshot.targetRound)
  if (existing && (existing.kind !== 'live' || (existing.algorithmVersion ?? 1) >= (snapshot.algorithmVersion ?? 1))) return history
  const next = [snapshot, ...history.filter((item) => item !== existing)].sort((a, b) => b.targetRound - a.targetRound)
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    return history
  }
  return next
}

export function saveLegacyRecommendationSnapshot(snapshot: RecommendationSnapshot, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  if (snapshot.kind !== 'legacy') return readRecommendationHistory(storage)
  const saved = readRecommendationHistory(storage)
  // 이미 저장한 당시 추천은 종류·게임 수와 관계없이 보존한다.
  if (saved.some((item) => item.targetRound === snapshot.targetRound)) return saved
  const history = saved
  const next = [snapshot, ...history].sort((a, b) => b.targetRound - a.targetRound)
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    return history
  }
  return next
}

function prizeForRank(rank: 1 | 2 | 3 | 4 | 5, draw: HistoricalDraw) {
  const official = draw.prizes?.[rank as keyof PrizeAmounts]
  if (Number.isInteger(official) && Number(official) >= 0) return Number(official)
  if (rank === 1) return draw.firstPrize
  if (rank === 4) return 50_000
  if (rank === 5) return 5_000
  return null
}

export function evaluateGame(numbers: number[], draw: HistoricalDraw): Omit<GameOutcome, keyof SavedRecommendationGame> {
  const matchCount = numbers.filter((number) => draw.numbers.includes(number)).length
  const bonusMatched = numbers.includes(draw.bonus)
  let rank: GameOutcome['rank'] = null
  if (matchCount === 6) rank = 1
  else if (matchCount === 5 && bonusMatched) rank = 2
  else if (matchCount === 5) rank = 3
  else if (matchCount === 4) rank = 4
  else if (matchCount === 3) rank = 5
  return { rank, prize: rank ? prizeForRank(rank, draw) : 0, matchCount, bonusMatched }
}

export function evaluateRecommendationHistory(snapshots: RecommendationSnapshot[], draws: HistoricalDraw[]) {
  const drawMap = new Map(draws.map((draw) => [draw.round, draw]))
  const rounds: RecommendationRoundOutcome[] = snapshots.map((snapshot) => {
    const draw = drawMap.get(snapshot.targetRound) ?? null
    const games = snapshot.games.map((game): GameOutcome => draw
      ? { ...game, ...evaluateGame(game.numbers, draw) }
      : { ...game, rank: null, prize: null, matchCount: null, bonusMatched: false })
    return {
      snapshot,
      draw,
      games,
      totalPrize: games.reduce((sum, game) => sum + (game.prize ?? 0), 0),
    }
  })
  return {
    rounds,
    totalPrize: rounds.reduce((sum, round) => sum + round.totalPrize, 0),
    completedRounds: rounds.filter((round) => round.draw).length,
    winningGames: rounds.flatMap((round) => round.games).filter((game) => game.prize && game.prize > 0).length,
  }
}

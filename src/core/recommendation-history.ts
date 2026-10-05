// 회차별 추천 조합 스냅샷을 기기에 보존하고 공식 당첨 결과와 대조하는 모듈
import type { RankedCombination, RecommendationSets } from './analysis'
import type { HistoricalDraw, PrizeAmounts } from './history-data'

export type RecommendationCategory = 'top' | 'bottom' | 'mixed'

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
      ['top', 'bottom', 'mixed'].includes(game.category) && Number.isInteger(game.index) && isNumberSet(game.numbers) && typeof game.score === 'number',
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
    games: [
      ...toGames('top', sets.top),
      ...toGames('bottom', sets.bottom),
      ...toGames('mixed', sets.mixed),
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

export function saveRecommendationSnapshot(snapshot: RecommendationSnapshot, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const history = readRecommendationHistory(storage)
  if (history.some((item) => item.targetRound === snapshot.targetRound)) return history
  const next = [snapshot, ...history].sort((a, b) => b.targetRound - a.targetRound)
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
  if (saved.some((item) => item.targetRound === snapshot.targetRound && item.kind === 'legacy' && item.games.length === 10)) return saved
  const history = saved.filter((item) => item.targetRound !== snapshot.targetRound)
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

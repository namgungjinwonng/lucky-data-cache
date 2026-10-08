// 역대 당첨 패턴을 점수화해 다음 회차의 결정적 추천 조합 10개를 계산하는 분석 엔진
import type { HistoricalDraw } from './history-data'

export const JACKPOT_ODDS = 8_145_060

// 분석 가중치나 후보 생성 방식이 바뀌면 올려서 아직 추첨 전인 회차의 저장 추천을 새 결과로 교체한다.
export const ALGORITHM_VERSION = 2

export const SCORE_WEIGHTS = { frequency: 0.21, recent: 0.24, pairs: 0.22, balance: 0.23, carryover: 0.1 } as const

// 직전 연속 출현 주수는 3주 이상을 하나로 묶는다.
const MAX_STREAK = 3
// 표본이 적은 연속 구간이 과대평가되지 않도록 이론 확률 6/45 쪽으로 당기는 가상 관측 수
const STREAK_PRIOR = 100

export interface CarryoverStats {
  /** 직전 회차 번호가 k개 이어서 나온 회차 비율, 인덱스 0~6 */
  distribution: number[]
  /** 직전 s주 연속 나온 번호가 다음 회차에 다시 나온 비율, 인덱스 0은 직전 회차에 없던 번호 */
  streakRate: number[]
  /** 최신 회차 기준 번호별 연속 출현 주수, 0~MAX_STREAK */
  streaks: number[]
}

export interface RankedCombination {
  rank: number
  numbers: number[]
  score: number
  components: {
    frequency: number
    recent: number
    pairs: number
    balance: number
    carryover: number
  }
  /** 직전 회차 당첨번호와 겹치는 개수 */
  carried: number
}

export interface RecommendationSets {
  top: RankedCombination[]
  bottom: RankedCombination[]
  mixed: RankedCombination[]
}

interface Candidate extends Omit<RankedCombination, 'rank' | 'score'> {
  rawScore: number
}

interface AnalysisModel {
  candidates: Candidate[]
  mean: number
  deviation: number
  normalizedFrequency: number[]
  normalizedRecent: number[]
  scoreNumbers: (numbers: number[]) => Candidate
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function normalize(values: number[]) {
  const min = Math.min(...values.slice(1))
  const max = Math.max(...values.slice(1))
  const span = max - min || 1
  return values.map((value, index) => index === 0 ? 0 : (value - min) / span)
}

function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}

function gaussian(value: number, mean: number, standardDeviation: number) {
  const deviation = standardDeviation || 1
  return Math.exp(-0.5 * ((value - mean) / deviation) ** 2)
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function createCandidate(random: () => number) {
  const values = Array.from({ length: 45 }, (_, index) => index + 1)
  for (let index = 0; index < 6; index += 1) {
    const swap = index + Math.floor(random() * (45 - index))
    ;[values[index], values[swap]] = [values[swap], values[index]]
  }
  return values.slice(0, 6).sort((a, b) => a - b)
}

function createWeightedCandidate(numbers: number[], weights: number[], random: () => number) {
  const available = numbers.map((number) => ({ number, weight: weights[number] }))
  const selected: number[] = []
  while (selected.length < 6 && available.length > 0) {
    const total = available.reduce((sum, item) => sum + item.weight, 0)
    let threshold = random() * total
    let index = 0
    while (index < available.length - 1 && threshold > available[index].weight) {
      threshold -= available[index].weight
      index += 1
    }
    selected.push(available[index].number)
    available.splice(index, 1)
  }
  return selected.sort((a, b) => a - b)
}

// 직전 회차 번호의 이월 개수와 2·3주 연속 출현 번호의 재출현 비율을 역대 데이터에서 측정한다.
export function analyzeCarryover(draws: HistoricalDraw[]): CarryoverStats {
  const ascending = [...draws].sort((a, b) => a.round - b.round)
  const counts = Array(7).fill(0) as number[]
  const trials = Array(MAX_STREAK + 1).fill(0) as number[]
  const hits = Array(MAX_STREAK + 1).fill(0) as number[]
  const running = Array(46).fill(0) as number[]

  ascending.forEach((draw, index) => {
    const current = new Set(draw.numbers)
    if (index > 0) {
      counts[ascending[index - 1].numbers.filter((number) => current.has(number)).length] += 1
      for (let number = 1; number <= 45; number += 1) {
        trials[running[number]] += 1
        if (current.has(number)) hits[running[number]] += 1
      }
    }
    for (let number = 1; number <= 45; number += 1) {
      running[number] = current.has(number) ? Math.min(MAX_STREAK, running[number] + 1) : 0
    }
  })

  const total = Math.max(1, ascending.length - 1)
  const base = 6 / 45
  return {
    distribution: counts.map((count) => count / total),
    streakRate: hits.map((hit, streak) => (hit + base * STREAK_PRIOR) / (trials[streak] + STREAK_PRIOR)),
    streaks: running,
  }
}

function createAnalysisModel(draws: HistoricalDraw[], poolSize: number): AnalysisModel {
  if (draws.length < 20) throw new Error('패턴 분석에는 최소 20개 회차가 필요합니다.')
  const ordered = [...draws].sort((a, b) => b.round - a.round)
  const frequency = Array(46).fill(0) as number[]
  const recentFrequency = Array(46).fill(0) as number[]
  const pairFrequency = new Map<string, number>()
  const oddDistribution = Array(7).fill(0) as number[]
  const lowDistribution = Array(7).fill(0) as number[]
  const sums: number[] = []

  ordered.forEach((draw, index) => {
    const weight = 0.5 ** (index / 26)
    draw.numbers.forEach((number) => {
      frequency[number] += 1
      recentFrequency[number] += weight
    })
    if (index < 156) {
      for (let left = 0; left < 6; left += 1) {
        for (let right = left + 1; right < 6; right += 1) {
          const key = pairKey(draw.numbers[left], draw.numbers[right])
          pairFrequency.set(key, (pairFrequency.get(key) ?? 0) + 0.5 ** (index / 52))
        }
      }
    }
    oddDistribution[draw.numbers.filter((number) => number % 2 === 1).length] += 1
    lowDistribution[draw.numbers.filter((number) => number <= 22).length] += 1
    sums.push(draw.numbers.reduce((sum, number) => sum + number, 0))
  })

  const normalizedFrequency = normalize(frequency)
  const normalizedRecent = normalize(recentFrequency)
  const maxPair = Math.max(...pairFrequency.values(), 1)
  const maxOdd = Math.max(...oddDistribution)
  const maxLow = Math.max(...lowDistribution)
  const sumMean = average(sums)
  const sumDeviation = Math.sqrt(average(sums.map((sum) => (sum - sumMean) ** 2)))
  const carryover = analyzeCarryover(draws)
  const maxCarry = Math.max(...carryover.distribution)
  const maxStreakRate = Math.max(...carryover.streakRate)
  const latestNumbers = new Set(ordered[0].numbers)
  const random = seededRandom((ordered[0].round + 1) * 2_654_435_761)
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  const scoreNumbers = (numbers: number[]): Candidate => {
    const frequencyScore = average(numbers.map((number) => normalizedFrequency[number]))
    const recentScore = average(numbers.map((number) => normalizedRecent[number]))
    const pairScores: number[] = []
    for (let left = 0; left < 6; left += 1) {
      for (let right = left + 1; right < 6; right += 1) {
        pairScores.push((pairFrequency.get(pairKey(numbers[left], numbers[right])) ?? 0) / maxPair)
      }
    }
    const pairsScore = average(pairScores)
    const oddCount = numbers.filter((number) => number % 2 === 1).length
    const lowCount = numbers.filter((number) => number <= 22).length
    const sum = numbers.reduce((total, number) => total + number, 0)
    const balanceScore = average([
      gaussian(sum, sumMean, sumDeviation),
      oddDistribution[oddCount] / maxOdd,
      lowDistribution[lowCount] / maxLow,
    ])
    const carried = numbers.filter((number) => latestNumbers.has(number)).length
    const carryoverScore = (carryover.distribution[carried] / maxCarry) * 0.7
      + average(numbers.map((number) => carryover.streakRate[carryover.streaks[number]] / maxStreakRate)) * 0.3
    return {
      numbers,
      carried,
      rawScore: frequencyScore * SCORE_WEIGHTS.frequency + recentScore * SCORE_WEIGHTS.recent + pairsScore * SCORE_WEIGHTS.pairs
        + balanceScore * SCORE_WEIGHTS.balance + carryoverScore * SCORE_WEIGHTS.carryover,
      components: {
        frequency: Math.round(frequencyScore * 100),
        recent: Math.round(recentScore * 100),
        pairs: Math.round(pairsScore * 100),
        balance: Math.round(balanceScore * 100),
        carryover: Math.round(carryoverScore * 100),
      },
    }
  }

  while (candidates.length < poolSize) {
    const numbers = createCandidate(random)
    const key = numbers.join('-')
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(scoreNumbers(numbers))
  }

  candidates.sort((a, b) => b.rawScore - a.rawScore || a.numbers.join('-').localeCompare(b.numbers.join('-')))
  const mean = average(candidates.map((candidate) => candidate.rawScore))
  const deviation = Math.sqrt(average(candidates.map((candidate) => (candidate.rawScore - mean) ** 2))) || 1
  return { candidates, mean, deviation, normalizedFrequency, normalizedRecent, scoreNumbers }
}

function selectDiverse(candidates: Candidate[], count: number, excluded = new Set<string>()) {
  const selected: Candidate[] = []
  for (const candidate of candidates) {
    if (excluded.has(candidate.numbers.join('-'))) continue
    const overlapsTooMuch = selected.some((chosen) => candidate.numbers.filter((number) => chosen.numbers.includes(number)).length > 4)
    if (!overlapsTooMuch) selected.push(candidate)
    if (selected.length === count) break
  }

  return selected
}

function toRanked(candidates: Candidate[], mean: number, deviation: number): RankedCombination[] {
  return candidates.map((candidate, index) => ({
    rank: index + 1,
    numbers: candidate.numbers,
    carried: candidate.carried,
    score: Math.round(Math.max(0, Math.min(100, 50 + ((candidate.rawScore - mean) / deviation) * 12)) * 10) / 10,
    components: candidate.components,
  }))
}

export function rankRecommendationSets(draws: HistoricalDraw[], poolSize = 30_000): RecommendationSets {
  const model = createAnalysisModel(draws, poolSize)
  const topCandidates = selectDiverse(model.candidates, 10)
  const topKeys = new Set(topCandidates.map((candidate) => candidate.numbers.join('-')))
  const bottomCandidates = selectDiverse([...model.candidates].reverse(), 5, topKeys)
  const sourceKeys = new Set([...topKeys, ...bottomCandidates.map((candidate) => candidate.numbers.join('-'))])
  const topNumbers = new Set(topCandidates.flatMap((candidate) => candidate.numbers))
  const bottomNumbers = new Set(bottomCandidates.flatMap((candidate) => candidate.numbers))
  const sourceNumbers = [...new Set([...topNumbers, ...bottomNumbers])]
  const topOnly = new Set(sourceNumbers.filter((number) => topNumbers.has(number) && !bottomNumbers.has(number)))
  const bottomOnly = new Set(sourceNumbers.filter((number) => bottomNumbers.has(number) && !topNumbers.has(number)))
  const numberWeights = Array(46).fill(0.05) as number[]
  sourceNumbers.forEach((number) => {
    const priority = model.normalizedFrequency[number] * 0.45 + model.normalizedRecent[number] * 0.55
    numberWeights[number] = 0.05 + priority ** 2
  })

  const random = seededRandom((((Math.max(...draws.map((draw) => draw.round)) + 1) * 2_654_435_761) ^ 0x9e3779b9) >>> 0)
  const mixedMap = new Map<string, Candidate>()
  let attempts = 0
  while (mixedMap.size < Math.min(6_000, poolSize) && attempts < poolSize * 5) {
    attempts += 1
    const numbers = createWeightedCandidate(sourceNumbers, numberWeights, random)
    if (numbers.length !== 6) break
    if (topOnly.size > 0 && !numbers.some((number) => topOnly.has(number))) continue
    if (bottomOnly.size > 0 && !numbers.some((number) => bottomOnly.has(number))) continue
    const key = numbers.join('-')
    if (sourceKeys.has(key) || mixedMap.has(key)) continue
    mixedMap.set(key, model.scoreNumbers(numbers))
  }
  const mixedCandidates = [...mixedMap.values()].sort((a, b) => b.rawScore - a.rawScore || a.numbers.join('-').localeCompare(b.numbers.join('-')))

  return {
    top: toRanked(topCandidates, model.mean, model.deviation),
    bottom: toRanked(bottomCandidates, model.mean, model.deviation),
    mixed: toRanked(selectDiverse(mixedCandidates, 5), model.mean, model.deviation),
  }
}

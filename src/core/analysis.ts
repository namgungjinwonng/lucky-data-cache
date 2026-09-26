// 역대 당첨 패턴을 점수화해 다음 회차의 결정적 추천 조합 10개를 계산하는 분석 엔진
import type { HistoricalDraw } from './history-data'

export const JACKPOT_ODDS = 8_145_060

export interface RankedCombination {
  rank: number
  numbers: number[]
  score: number
  components: {
    frequency: number
    recent: number
    pairs: number
    balance: number
  }
}

interface Candidate extends Omit<RankedCombination, 'rank' | 'score'> {
  rawScore: number
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

export function rankCombinations(draws: HistoricalDraw[], count = 10, poolSize = 30_000): RankedCombination[] {
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
  const random = seededRandom((ordered[0].round + 1) * 2_654_435_761)
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  while (candidates.length < poolSize) {
    const numbers = createCandidate(random)
    const key = numbers.join('-')
    if (seen.has(key)) continue
    seen.add(key)

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
    const rawScore = frequencyScore * 0.24 + recentScore * 0.27 + pairsScore * 0.24 + balanceScore * 0.25
    candidates.push({
      numbers,
      rawScore,
      components: {
        frequency: Math.round(frequencyScore * 100),
        recent: Math.round(recentScore * 100),
        pairs: Math.round(pairsScore * 100),
        balance: Math.round(balanceScore * 100),
      },
    })
  }

  candidates.sort((a, b) => b.rawScore - a.rawScore || a.numbers.join('-').localeCompare(b.numbers.join('-')))
  const mean = average(candidates.map((candidate) => candidate.rawScore))
  const deviation = Math.sqrt(average(candidates.map((candidate) => (candidate.rawScore - mean) ** 2))) || 1
  const selected: Candidate[] = []
  for (const candidate of candidates) {
    const overlapsTooMuch = selected.some((chosen) => candidate.numbers.filter((number) => chosen.numbers.includes(number)).length > 4)
    if (!overlapsTooMuch) selected.push(candidate)
    if (selected.length === count) break
  }

  return selected.map((candidate, index) => ({
    rank: index + 1,
    numbers: candidate.numbers,
    score: Math.round(Math.max(0, Math.min(100, 50 + ((candidate.rawScore - mean) / deviation) * 12)) * 10) / 10,
    components: candidate.components,
  }))
}

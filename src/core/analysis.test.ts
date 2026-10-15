// 패턴 추천 결과의 재현성·정렬·조합 다양성을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { analyzeCarryover, rankRecommendationSets } from './analysis'
import type { HistoricalDraw } from './history-data'

const draws: HistoricalDraw[] = Array.from({ length: 120 }, (_, index) => {
  const start = (index * 7) % 45
  const numbers = Array.from({ length: 6 }, (_, offset) => ((start + offset * 8) % 45) + 1).sort((a, b) => a - b)
  const bonus = Array.from({ length: 45 }, (_, number) => number + 1).find((number) => !numbers.includes(number)) ?? 45
  return { round: index + 1, date: '2026-01-01', numbers, bonus, firstPrize: 1_000_000_000, winners: 10 }
})

describe('rankRecommendationSets', () => {
  it('같은 회차 데이터에서는 동일한 상위 10개 조합을 만든다', () => {
    expect(rankRecommendationSets(draws, 2_000)).toEqual(rankRecommendationSets(draws, 2_000))
  })

  it('중복 없는 유효 조합을 점수 내림차순으로 반환한다', () => {
    const ranked = rankRecommendationSets(draws, 2_000).top
    expect(ranked).toHaveLength(10)
    expect(new Set(ranked.map((item) => item.numbers.join('-'))).size).toBe(10)
    expect(ranked.every((item) => item.numbers.length === 6 && new Set(item.numbers).size === 6)).toBe(true)
    expect(ranked.every((item, index) => index === 0 || ranked[index - 1].score >= item.score)).toBe(true)
    expect(ranked.every((item) => item.numbers.every((number) => number >= 1 && number <= 45))).toBe(true)
  })

  it('상위 10게임 결과를 회귀 테스트로 고정한다', () => {
    expect(rankRecommendationSets(draws, 2_000).top.map((item) => item.numbers)).toEqual([
      [4, 12, 17, 26, 41, 45],
      [4, 5, 9, 29, 41, 42],
      [4, 5, 20, 33, 39, 41],
      [4, 14, 20, 28, 34, 43],
      [6, 7, 21, 28, 33, 41],
      [10, 15, 17, 25, 34, 36],
      [3, 11, 17, 24, 38, 43],
      [10, 17, 20, 27, 30, 35],
      [5, 13, 17, 28, 33, 43],
      [10, 13, 17, 31, 34, 35],
    ])
  })

  it('상위 10게임과 겹침을 제한한 분산 10게임을 생성한다', () => {
    const sets = rankRecommendationSets(draws, 2_000)
    const all = [...sets.top, ...sets.dispersion]
    expect(sets.dispersion).toHaveLength(10)
    expect(new Set(all.map((item) => item.numbers.join('-'))).size).toBe(20)
    for (const game of sets.dispersion) {
      expect(game.numbers).toHaveLength(6)
      expect(new Set(game.numbers).size).toBe(6)
      expect(game.numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)).toBe(true)
      expect(game.numbers).toEqual([...game.numbers].sort((a, b) => a - b))
      for (const other of all) {
        if (other === game) continue
        expect(game.numbers.filter((n) => other.numbers.includes(n)).length).toBeLessThanOrEqual(2)
      }
    }
    expect(rankRecommendationSets([...draws].reverse(), 2_000)).toEqual(sets)
  })
})

describe('analyzeCarryover', () => {
  const draw = (round: number, numbers: number[]): HistoricalDraw => ({ round, date: '2026-01-01', numbers, bonus: 45, firstPrize: 1, winners: 1 })
  const sample = [
    draw(1, [1, 2, 3, 4, 5, 6]),
    draw(2, [1, 2, 7, 8, 9, 10]),
    draw(3, [1, 11, 12, 13, 14, 15]),
    draw(4, [16, 17, 18, 19, 20, 21]),
  ]

  it('직전 회차 번호의 이월 개수 분포를 계산한다', () => {
    const stats = analyzeCarryover([...sample].reverse())
    expect(stats.distribution.map((value) => Math.round(value * 3))).toEqual([1, 1, 1, 0, 0, 0, 0])
  })

  it('최신 회차 기준 연속 출현 주수를 3주 이상으로 묶어 기록한다', () => {
    const stats = analyzeCarryover([...sample, draw(5, [1, 16, 22, 23, 24, 25]), draw(6, [1, 16, 26, 27, 28, 29])])
    expect(stats.streaks[1]).toBe(2)
    expect(stats.streaks[16]).toBe(3)
    expect(stats.streaks[26]).toBe(1)
    expect(stats.streaks[2]).toBe(0)
  })

  it('표본이 적은 연속 구간의 재출현 비율은 이론값 6/45 쪽으로 보정한다', () => {
    const stats = analyzeCarryover(sample)
    stats.streakRate.forEach((rate) => {
      expect(rate).toBeGreaterThan(0.05)
      expect(rate).toBeLessThan(0.25)
    })
  })
})

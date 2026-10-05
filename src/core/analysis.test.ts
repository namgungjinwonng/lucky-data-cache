// 패턴 추천 결과의 재현성·정렬·조합 다양성을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { rankCombinations, rankRecommendationSets } from './analysis'
import type { HistoricalDraw } from './history-data'

const draws: HistoricalDraw[] = Array.from({ length: 120 }, (_, index) => {
  const start = (index * 7) % 45
  const numbers = Array.from({ length: 6 }, (_, offset) => ((start + offset * 8) % 45) + 1).sort((a, b) => a - b)
  const bonus = Array.from({ length: 45 }, (_, number) => number + 1).find((number) => !numbers.includes(number)) ?? 45
  return { round: index + 1, date: '2026-01-01', numbers, bonus, firstPrize: 1_000_000_000, winners: 10 }
})

describe('rankCombinations', () => {
  it('같은 회차 데이터에서는 동일한 상위 10개 조합을 만든다', () => {
    expect(rankCombinations(draws, 10, 2_000)).toEqual(rankCombinations(draws, 10, 2_000))
  })

  it('중복 없는 유효 조합을 점수 내림차순으로 반환한다', () => {
    const ranked = rankCombinations(draws, 10, 2_000)
    expect(ranked).toHaveLength(10)
    expect(new Set(ranked.map((item) => item.numbers.join('-'))).size).toBe(10)
    expect(ranked.every((item) => item.numbers.length === 6 && new Set(item.numbers).size === 6)).toBe(true)
    expect(ranked.every((item, index) => index === 0 || ranked[index - 1].score >= item.score)).toBe(true)
    expect(ranked.every((item) => item.numbers.every((number) => number >= 1 && number <= 45))).toBe(true)
  })

  it('기존 상위 10게임의 결과를 그대로 유지한다', () => {
    expect(rankCombinations(draws, 10, 2_000).map((item) => item.numbers)).toEqual([
      [3, 11, 17, 24, 38, 43],
      [3, 15, 19, 24, 32, 43],
      [1, 3, 22, 24, 40, 41],
      [3, 6, 12, 28, 36, 41],
      [3, 4, 13, 28, 33, 41],
      [4, 12, 20, 24, 35, 44],
      [3, 7, 11, 25, 41, 44],
      [3, 11, 21, 28, 32, 36],
      [3, 11, 19, 29, 37, 41],
      [6, 17, 21, 24, 35, 41],
    ])
  })

  it('상위 10·하위 5·혼합 5게임을 중복 없이 생성한다', () => {
    const sets = rankRecommendationSets(draws, 2_000)
    const all = [...sets.top, ...sets.bottom, ...sets.mixed]
    const topNumbers = new Set(sets.top.flatMap((item) => item.numbers))
    const bottomNumbers = new Set(sets.bottom.flatMap((item) => item.numbers))
    const topOnly = new Set([...topNumbers].filter((number) => !bottomNumbers.has(number)))
    const bottomOnly = new Set([...bottomNumbers].filter((number) => !topNumbers.has(number)))

    expect(sets.top).toEqual(rankCombinations(draws, 10, 2_000))
    expect(sets.bottom).toHaveLength(5)
    expect(sets.mixed).toHaveLength(5)
    expect(new Set(all.map((item) => item.numbers.join('-'))).size).toBe(20)
    expect(sets.mixed.every((item) => item.numbers.every((number) => topNumbers.has(number) || bottomNumbers.has(number)))).toBe(true)
    expect(sets.mixed.every((item) => item.numbers.some((number) => topOnly.has(number)) && item.numbers.some((number) => bottomOnly.has(number)))).toBe(true)
    expect(Math.min(...sets.mixed.map((item) => item.score))).toBeGreaterThan(Math.max(...sets.bottom.map((item) => item.score)))
  })
})

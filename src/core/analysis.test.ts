// 패턴 추천 결과의 재현성·정렬·조합 다양성을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { rankCombinations } from './analysis'
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
})

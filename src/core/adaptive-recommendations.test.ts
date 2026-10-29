// @vitest-environment node
import { describe, expect, it } from 'vitest'
import dataset from '../../public/data/history.json'
import type { HistoricalDraw } from './history-data'
import { allocateGames, BASE_SHARES, buildAdaptiveRecommendations, makeAllocation, recentPatternScores, scoreBin, trainingSignature } from './adaptive-recommendations'
const draws = dataset.draws as HistoricalDraw[]

describe('점수 구간 자동 배분', () => {
  it('기본 배분은 1·3·6·6·3·1이며 합계 20개다', () => {
    expect(allocateGames(BASE_SHARES)).toEqual([0, 0, 1, 3, 6, 6, 3, 1, 0, 0])
    expect(allocateGames(Array(10).fill(1))).toEqual(Array(10).fill(2))
  })
  it('최근 분포를 최대 20% 반영하고 오래된 결과는 제외한다', () => {
    const a = makeAllocation(Array.from({ length: 26 }, (_, i) => ({ round: i + 1, score: 75 })))
    expect(a[7].share).toBeCloseTo(.24)
    expect(a.reduce((sum, r) => sum + r.count, 0)).toBe(20)
    expect(makeAllocation([{ round: 0, score: 5 }, ...Array.from({ length: 26 }, (_, i) => ({ round: i + 1, score: 75 }))])).toEqual(a)
    const one = makeAllocation([{ round: 1, score: 75 }])
    expect(one[7].share).toBeLessThan(.06)
  })
  it('표시 점수 경계와 100점을 정확한 구간에 넣는다', () => {
    expect([9.9, 10, 49.9, 50, 99.9, 100].map(scoreBin)).toEqual([0, 1, 4, 5, 9, 9])
  })
  it('당첨 점수는 직전 회차까지만 학습하고 캐시와 미래 데이터에 영향받지 않는다', async () => {
    const past = draws.filter(d => d.round <= 1247)
    const scores = await recentPatternScores(past)
    expect(scores.at(-1)?.score).toBe(40.3)
    expect(scores.find(r => r.round === 1246)?.score).toBe(60)
    expect(await recentPatternScores([...past].reverse(), scores)).toEqual(scores)
    // 해시가 맞지 않는 캐시는 재계산한다.
    expect(await recentPatternScores(past, [{ round: 1247, score: 99, signature: 'wrong' }])).toEqual(scores)
    const ascending = [...past].sort((a, b) => a.round - b.round)
    expect(scores.at(-1)?.signature).toBe(await trainingSignature(ascending))
  })
  it('실제 데이터에서 구간별 개수를 지키는 20게임과 전체 쌍 중복 최대 2개를 만든다', async () => {
    const result = await buildAdaptiveRecommendations(draws)
    const all = [...result.sets.top, ...result.sets.dispersion]
    expect(all).toHaveLength(20)
    expect(new Set(all.map(g => g.numbers.join('-'))).size).toBe(20)
    expect(result.sourceRound).toBe(1247)
    for (const r of result.allocation) expect(all.filter(g => scoreBin(g.score) === r.bin)).toHaveLength(r.count)
    all.forEach((g, i) => {
      expect(g.numbers).toHaveLength(6)
      expect(g.numbers).toEqual([...new Set(g.numbers)].sort((a, b) => a - b))
      for (const other of all.slice(i + 1)) expect(g.numbers.filter(n => other.numbers.includes(n)).length).toBeLessThanOrEqual(2)
    })
    expect((await buildAdaptiveRecommendations([...draws].reverse(), result.scores)).sets).toEqual(result.sets)
  }, 20_000)
  it('새 회차 당첨번호를 받아 새 점수와 다음 회차 비율을 자동 계산한다', async () => {
    const before = await buildAdaptiveRecommendations(draws)
    const nextDraw = { ...draws.find(d => d.round === 1247)!, round: 1248, date: '2026-10-31', numbers: [1, 2, 3, 4, 5, 6] }
    const next = await buildAdaptiveRecommendations([...draws, nextDraw], before.scores)
    expect(next.sourceRound).toBe(1248)
    expect(next.scores.at(-1)?.round).toBe(1248)
    expect(next.scores.at(-1)?.score).toBeGreaterThanOrEqual(0)
    expect(next.allocation.map(r => r.share)).not.toEqual(before.allocation.map(r => r.share))
    expect(next.sets).not.toEqual(before.sets)
    expect(next.scores.find(r => r.round === 1247)).toEqual(before.scores.find(r => r.round === 1247))
  }, 20_000)
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import dataset from '../../public/data/history.json'
import type { HistoricalDraw } from './history-data'
import { buildAdaptiveRecommendations, GAME_COUNT, inScoreBand, popularityReasons, recentPatternScores, trainingSignature } from './adaptive-recommendations'
// 매주 자동 갱신되는 실제 데이터에서 시드 캐시와 같은 1,247회까지만 고정해 기대값이 바뀌지 않게 한다.
const draws = (dataset.draws as HistoricalDraw[]).filter(d => d.round <= 1247)

describe('40~65점 구간 10게임', () => {
  it('구간 경계는 40점 이상 65점 미만이다', () => {
    expect([39.9, 40, 64.9, 65].map(inScoreBand)).toEqual([false, true, true, false])
  })
  it('인기 조합 조건을 각각 판별한다', () => {
    const firsts = new Set(['3-11-17-24-38-43'])
    expect(popularityReasons([1, 5, 12, 19, 25, 31], [], firsts)).toEqual(['allLow'])
    expect(popularityReasons([1, 2, 3, 4, 20, 40], [], firsts)).toEqual(['sameRow'])
    expect(popularityReasons([2, 9, 20, 33, 40, 44], [2, 9, 20, 30, 31, 35], firsts)).toEqual(['carryover'])
    expect(popularityReasons([3, 11, 17, 24, 38, 43], [], firsts)).toEqual(['pastFirst'])
    expect(popularityReasons([2, 9, 20, 33, 40, 44], [], firsts)).toEqual([])
  })
  it('당첨 점수는 직전 회차까지만 학습하고 캐시와 미래 데이터에 영향받지 않는다', async () => {
    const scores = await recentPatternScores(draws)
    expect(scores.at(-1)?.score).toBe(40.3)
    expect(scores.find(r => r.round === 1246)?.score).toBe(60)
    expect(await recentPatternScores([...draws].reverse(), scores)).toEqual(scores)
    // 해시가 맞지 않는 캐시는 재계산한다.
    expect(await recentPatternScores(draws, [{ round: 1247, score: 99, signature: 'wrong' }])).toEqual(scores)
    const ascending = [...draws].sort((a, b) => a.round - b.round)
    expect(scores.at(-1)?.signature).toBe(await trainingSignature(ascending))
  })
  it('실제 데이터에서 구간 안의 10게임을 겹침 2개 이하·인기 조합 제외로 만든다', async () => {
    const result = await buildAdaptiveRecommendations(draws)
    const last = draws.find(d => d.round === 1247)!.numbers
    const firsts = new Set(draws.map(d => [...d.numbers].sort((a, b) => a - b).join('-')))
    expect(result.games).toHaveLength(GAME_COUNT)
    expect(result.sourceRound).toBe(1247)
    expect(result.bandShare).toBeGreaterThan(.6)
    expect(result.recentInBand).toBe(result.scores.filter(r => inScoreBand(r.score)).length)
    result.games.forEach((g, i) => {
      expect(inScoreBand(g.score)).toBe(true)
      expect(g.numbers).toEqual([...new Set(g.numbers)].sort((a, b) => a - b))
      expect(popularityReasons(g.numbers, last, firsts)).toEqual([])
      for (const other of result.games.slice(i + 1)) expect(g.numbers.filter(n => other.numbers.includes(n)).length).toBeLessThanOrEqual(2)
    })
    expect(result.games.every((g, i) => i === 0 || result.games[i - 1].score >= g.score)).toBe(true)
    expect((await buildAdaptiveRecommendations([...draws].reverse(), result.scores)).games).toEqual(result.games)
  }, 20_000)
  it('인기 조합이 뽑히지 않는 회차는 필터가 없을 때와 같은 10게임이다', async () => {
    // 1,241회까지의 데이터(1,242회 추천)는 필터 없이도 제외 대상이 선택되지 않는다.
    const past = draws.filter(d => d.round <= 1241)
    const last = past.find(d => d.round === 1241)!.numbers
    const firsts = new Set(past.map(d => [...d.numbers].sort((a, b) => a - b).join('-')))
    const plain = await buildAdaptiveRecommendations(past, [], false)
    expect(plain.games.every(g => popularityReasons(g.numbers, last, firsts).length === 0)).toBe(true)
    expect((await buildAdaptiveRecommendations(past, plain.scores)).games).toEqual(plain.games)
  }, 20_000)
  it('새 회차 당첨번호를 받아 새 점수와 다음 회차 추천을 자동 계산한다', async () => {
    const before = await buildAdaptiveRecommendations(draws)
    const nextDraw = { ...draws.find(d => d.round === 1247)!, round: 1248, date: '2026-10-31', numbers: [1, 2, 3, 4, 5, 6] }
    const next = await buildAdaptiveRecommendations([...draws, nextDraw], before.scores)
    expect(next.sourceRound).toBe(1248)
    expect(next.scores.at(-1)?.round).toBe(1248)
    expect(next.scores.at(-1)?.score).toBeGreaterThanOrEqual(0)
    expect(next.games).not.toEqual(before.games)
    expect(next.scores.find(r => r.round === 1247)).toEqual(before.scores.find(r => r.round === 1247))
  }, 20_000)
})

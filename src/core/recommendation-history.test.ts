// 추천 스냅샷 보존과 로또 등수·당첨금 계산을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import type { RecommendationSets } from './analysis'
import { createLegacy1244Snapshot, createRecommendationSnapshot, evaluateGame, evaluateRecommendationHistory, isRecommendationOpen, readRecommendationHistory, saveLegacyRecommendationSnapshot, saveRecommendationSnapshot } from './recommendation-history'
import type { HistoricalDraw } from './history-data'

const draw: HistoricalDraw = {
  round: 125,
  date: '2026-10-10',
  numbers: [1, 2, 3, 4, 5, 6],
  bonus: 7,
  firstPrize: 1_000_000_000,
  winners: 10,
  prizes: { 1: 1_000_000_000, 2: 50_000_000, 3: 1_500_000, 4: 50_000, 5: 5_000 },
}

const combinations = (count: number, start: number) => Array.from({ length: count }, (_, index) => ({
  rank: index + 1,
  numbers: Array.from({ length: 6 }, (_, offset) => ((start + index + offset - 1) % 45) + 1).sort((a, b) => a - b),
  score: 90 - index,
  carried: 0,
  components: { frequency: 50, recent: 50, pairs: 50, balance: 50, carryover: 50 },
}))

const sets: RecommendationSets = { top: combinations(10, 1), dispersion: combinations(10, 15) }
const pending = { latestRound: 124, sourceDate: '2026-10-03', now: Date.parse('2026-10-05T00:00:00Z') }

describe('추천 당첨 이력', () => {
  it('1~5등 조건과 공식 1인당 당첨금을 계산한다', () => {
    expect(evaluateGame([1, 2, 3, 4, 5, 6], draw)).toMatchObject({ rank: 1, prize: 1_000_000_000 })
    expect(evaluateGame([1, 2, 3, 4, 5, 7], draw)).toMatchObject({ rank: 2, prize: 50_000_000 })
    expect(evaluateGame([1, 2, 3, 4, 5, 8], draw)).toMatchObject({ rank: 3, prize: 1_500_000 })
    expect(evaluateGame([1, 2, 3, 4, 8, 9], draw)).toMatchObject({ rank: 4, prize: 50_000 })
    expect(evaluateGame([1, 2, 3, 8, 9, 10], draw)).toMatchObject({ rank: 5, prize: 5_000 })
    expect(evaluateGame([1, 2, 8, 9, 10, 11], draw)).toMatchObject({ rank: null, prize: 0 })
  })

  it('같은 목표 회차 스냅샷을 덮어쓰지 않는다', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const first = createRecommendationSnapshot(sets, 125, 124, '2026-10-04T00:00:00.000Z')
    const changed = { ...first, generatedAt: '2026-10-05T00:00:00.000Z', games: [...first.games].reverse() }
    saveRecommendationSnapshot(first, pending, storage)
    const saved = saveRecommendationSnapshot(changed, pending, storage)
    expect(saved).toEqual([first])
  })

  it('추첨 전 회차의 이전 알고리즘 live 기록은 새 결과로 교체한다', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const older = createRecommendationSnapshot(sets, 125, 124, '2026-10-04T00:00:00.000Z')
    delete older.algorithmVersion
    saveRecommendationSnapshot(older, pending, storage)
    const current = createRecommendationSnapshot({ ...sets, dispersion: [...sets.dispersion].reverse() }, 125, 124, '2026-10-05T00:00:00.000Z')
    expect(saveRecommendationSnapshot(current, pending, storage)).toEqual([current])
    expect(current.games.slice(0, 10)).toEqual(older.games.slice(0, 10))
    expect(current.games.every((g) => g.category === 'balanced')).toBe(true)
  })

  it('오래된 오프라인 캐시라도 마감된 회차는 교체하거나 소급 생성하지 않는다', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const older = { ...createRecommendationSnapshot(sets, 125, 124), algorithmVersion: 2 }
    saveRecommendationSnapshot(older, pending, storage)
    const current = createRecommendationSnapshot(sets, 125, 124)
    const before = [...values.values()][0]
    expect(saveRecommendationSnapshot(current, { ...pending, now: Date.parse('2026-10-11T00:00:00Z') }, storage)).toEqual([older])
    expect([...values.values()][0]).toBe(before)
    expect(saveRecommendationSnapshot(current, { ...pending, latestRound: 125 }, storage)).toEqual([older])
    const empty = { getItem: () => null, setItem: () => { throw new Error('마감된 회차를 저장하면 안 됨') } }
    expect(saveRecommendationSnapshot(current, { ...pending, now: Date.parse('2026-10-11T00:00:00Z') }, empty)).toEqual([])
  })

  it('더 높은 알고리즘 버전의 기록을 낮은 버전으로 되돌리지 않는다', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const newer = { ...createRecommendationSnapshot(sets, 125, 124), algorithmVersion: 5 }
    saveRecommendationSnapshot(newer, pending, storage)
    expect(saveRecommendationSnapshot(createRecommendationSnapshot(sets, 125, 124), pending, storage)).toEqual([newer])
  })

  it('KST 마감 직전만 교체를 허용하고 잘못된 날짜는 허용하지 않는다', () => {
    const snapshot = createRecommendationSnapshot(sets, 125, 124)
    expect(isRecommendationOpen(snapshot, { ...pending, now: Date.parse('2026-10-10T19:59:59+09:00') })).toBe(true)
    expect(isRecommendationOpen(snapshot, { ...pending, now: Date.parse('2026-10-10T20:00:00+09:00') })).toBe(false)
    expect(isRecommendationOpen(snapshot, { ...pending, sourceDate: '2026-02-30' })).toBe(false)
  })

  it('이전 하위·혼합 기록의 번호와 분류를 보존해 읽는다', () => {
    const old = { ...createRecommendationSnapshot(sets, 125, 124), algorithmVersion: 2 }
    old.games.slice(0, 10).forEach(g => { g.category = 'top' })
    old.games.slice(10).forEach((g, i) => { g.category = i < 5 ? 'bottom' : 'mixed'; g.index = i % 5 + 1 })
    expect(readRecommendationHistory({ getItem: () => JSON.stringify([old]) })).toEqual([old])
  })

  it('1244회 고정 기록은 당시 상위 10게임과 실제 결과 120,000원을 유지한다', () => {
    const legacy = createLegacy1244Snapshot()
    const draw1244: HistoricalDraw = { round: 1244, date: '2026-10-03', numbers: [1, 13, 18, 26, 34, 38], bonus: 25, firstPrize: 1_604_686_625, winners: 18, prizes: { 1: 1_604_686_625, 2: 60_175_749, 3: 1_290_287, 4: 50_000, 5: 5_000 } }
    expect(legacy.games).toHaveLength(10)
    expect(evaluateRecommendationHistory([legacy], [draw1244]).totalPrize).toBe(120_000)
  })

  it('기존 1244회 기록은 고정 레거시로 덮어쓰지 않는다', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const existing = createRecommendationSnapshot(sets, 1244, 1243)
    saveRecommendationSnapshot(existing, { latestRound: 1243, sourceDate: '2026-09-26', now: Date.parse('2026-09-28T00:00:00Z') }, storage)
    const legacy = createLegacy1244Snapshot('2026-10-05T00:00:00.000Z')
    const saved = saveLegacyRecommendationSnapshot(legacy, storage)
    expect(saved).toEqual([existing])
    expect(saved[0].games).toHaveLength(20)
  })

  it('완료 회차의 게임별 결과와 누적 당첨금을 합산한다', () => {
    const snapshot = createRecommendationSnapshot(sets, 125, 124)
    snapshot.games.forEach((game) => { game.numbers = [8, 9, 10, 11, 12, 13] })
    snapshot.games[0].numbers = [1, 2, 3, 4, 5, 6]
    snapshot.games[1].numbers = [1, 2, 3, 8, 9, 10]
    const result = evaluateRecommendationHistory([snapshot], [draw])
    expect(result.completedRounds).toBe(1)
    expect(result.winningGames).toBe(2)
    expect(result.totalPrize).toBe(1_000_005_000)
  })
})

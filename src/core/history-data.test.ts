// 역대 회차 데이터의 연속성·중복·번호 범위 검증을 확인하는 테스트
import { describe, expect, it } from 'vitest'
import { isHistoryDataset } from './history-data'

const dataset = {
  schemaVersion: 1 as const,
  sourceUpdatedAt: '2026-09-26T00:00:00.000Z',
  draws: [
    { round: 2, date: '2002-12-14', numbers: [1, 2, 3, 4, 5, 6], bonus: 7, firstPrize: 1, winners: 1, prizes: { 1: 1, 2: 2, 3: 3, 4: 50_000, 5: 5_000 } },
    { round: 1, date: '2002-12-07', numbers: [10, 11, 12, 13, 14, 15], bonus: 16, firstPrize: 1, winners: 1 },
  ],
}

describe('isHistoryDataset', () => {
  it('1회부터 최신 회차까지 연속된 데이터를 허용한다', () => {
    expect(isHistoryDataset(dataset)).toBe(true)
  })

  it('회차 누락과 중복 번호를 거부한다', () => {
    expect(isHistoryDataset({ ...dataset, draws: dataset.draws.slice(0, 1) })).toBe(false)
    expect(isHistoryDataset({ ...dataset, draws: [{ ...dataset.draws[0], numbers: [1, 1, 3, 4, 5, 6] }, dataset.draws[1]] })).toBe(false)
  })

  it('당첨금이 있으면 1~5등의 음이 아닌 정수만 허용한다', () => {
    expect(isHistoryDataset({ ...dataset, draws: [{ ...dataset.draws[0], prizes: { ...dataset.draws[0].prizes, 2: -1 } }, dataset.draws[1]] })).toBe(false)
  })
})

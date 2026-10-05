// 원격 당첨 데이터의 필수 필드와 번호 무결성을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { isLatestDraw } from './draw-data'

const validDraw = {
  schemaVersion: 1 as const,
  round: 1242,
  date: '2026-09-19',
  numbers: [2, 4, 10, 16, 31, 41],
  bonus: 9,
  firstPrize: 3_281_029_250,
  winners: 9,
  prizes: { 1: 3_281_029_250, 2: 50_000_000, 3: 1_500_000, 4: 50_000, 5: 5_000 },
  sourceUpdatedAt: '2026-09-26T00:00:00.000Z',
}

describe('isLatestDraw', () => {
  it('정상적인 최신 회차 데이터를 허용한다', () => {
    expect(isLatestDraw(validDraw)).toBe(true)
  })

  it('중복 번호와 보너스 번호 중복을 거부한다', () => {
    expect(isLatestDraw({ ...validDraw, numbers: [2, 2, 10, 16, 31, 41] })).toBe(false)
    expect(isLatestDraw({ ...validDraw, bonus: 31 })).toBe(false)
  })

  it('등수별 당첨금의 음수와 누락을 거부한다', () => {
    expect(isLatestDraw({ ...validDraw, prizes: { ...validDraw.prizes, 3: -1 } })).toBe(false)
    const { 5: _missing, ...missingRank } = validDraw.prizes
    expect(isLatestDraw({ ...validDraw, prizes: missingRank })).toBe(false)
  })
})

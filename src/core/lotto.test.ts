// 번호 생성기의 범위, 중복, 고정수, 제외수 규칙을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { generateGame, generateGames } from './lotto'

describe('generateGame', () => {
  it('1부터 45까지 중복 없는 번호 6개를 정렬해 만든다', () => {
    const game = generateGame({ random: () => 0.42 })

    expect(game).toHaveLength(6)
    expect(new Set(game).size).toBe(6)
    expect(game.every((number) => number >= 1 && number <= 45)).toBe(true)
    expect(game).toEqual([...game].sort((a, b) => a - b))
  })

  it('고정수는 포함하고 제외수는 넣지 않는다', () => {
    const game = generateGame({
      fixed: [7, 21],
      excluded: [1, 2, 3, 4, 5, 6],
      random: () => 0.25,
    })

    expect(game).toEqual(expect.arrayContaining([7, 21]))
    expect(game.some((number) => [1, 2, 3, 4, 5, 6].includes(number))).toBe(false)
  })

  it('고정수와 제외수가 겹치면 거부한다', () => {
    expect(() => generateGame({ fixed: [9], excluded: [9] })).toThrow(
      '동시에 선택할 수 없습니다',
    )
  })
})

describe('generateGames', () => {
  it('요청한 게임 수만큼 만든다', () => {
    expect(generateGames({ count: 5 })).toHaveLength(5)
  })

  it('최대 5게임 제한을 검증한다', () => {
    expect(() => generateGames({ count: 6 })).toThrow('1개부터 5개')
  })
})

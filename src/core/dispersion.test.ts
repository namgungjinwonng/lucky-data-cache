import { describe, expect, it } from 'vitest'
import { selectDispersion } from './dispersion'

function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}
function game(next: () => number) {
  const numbers: number[] = []
  while (numbers.length < 6) {
    const n = Math.floor(next() * 45) + 1
    if (!numbers.includes(n)) numbers.push(n)
  }
  return numbers.sort((a, b) => a - b)
}

describe('분산 보완 선택', () => {
  it('32번 경계를 포함한 모든 번호의 적중을 직접 대조한 기준 구현과 일치한다', () => {
    const next = random(1945)
    const candidates = Array.from({ length: 100 }, () => ({ numbers: game(next) }))
    const top = [{ numbers: [1, 13, 18, 31, 32, 45] }, { numbers: [2, 13, 28, 33, 34, 38] }]
    const samples = Array.from({ length: 4096 }, () => game(next))
    // 기준 구현은 비트 마스크·세 번호 조합 표를 쓰지 않고 여섯 번호를 직접 대조한다.
    const hit = (numbers: number[], draw: number[]) => numbers.filter((n) => draw.includes(n)).length >= 3
    const uncovered = samples.map((draw) => !top.some((g) => hit(g.numbers, draw)))
    const exposure = Array(46).fill(0) as number[]
    top.forEach((g) => g.numbers.forEach((n) => { exposure[n] += 1 }))
    const expected: typeof candidates = []
    for (let step = 0; step < 3; step += 1) {
      const eligible = candidates.filter((c) => [...top, ...expected].every((g) => c.numbers.filter((n) => g.numbers.includes(n)).length <= 2))
      const ranked = eligible.map((c) => ({ c, gain: samples.filter((d, i) => uncovered[i] && hit(c.numbers, d)).length, repeated: c.numbers.reduce((s, n) => s + exposure[n], 0) }))
      ranked.sort((a, b) => b.gain - a.gain || a.repeated - b.repeated)
      const picked = ranked[0].c
      expected.push(picked)
      picked.numbers.forEach((n) => { exposure[n] += 1 })
      samples.forEach((draw, i) => { if (hit(picked.numbers, draw)) uncovered[i] = false })
    }
    // 후보 생성 후의 같은 난수 위치에서 가상 추첨을 시작한다.
    const sameRandom = random(1945)
    for (let i = 0; i < 100; i += 1) game(sameRandom)
    expect(selectDispersion(candidates, top, sameRandom, 3)).toEqual(expected)
  })
})

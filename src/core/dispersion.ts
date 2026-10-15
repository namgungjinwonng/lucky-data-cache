// 기존 상위 게임을 보존하면서 가상 균등 추첨에서 추가 당첨 기회를 넓히는 보완 게임 선택.
// 한 게임의 당첨확률을 높이는 점수가 아니라 전체 게임의 중복을 줄이는 기준이다.
const SAMPLE_COUNT = 4096
const CANDIDATE_COUNT = 2000

function popcount(value: number) {
  value -= (value >>> 1) & 0x55555555
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333)
  return Math.imul((value + (value >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

function mask(numbers: readonly number[]): [number, number] {
  let low = 0
  let high = 0
  for (const number of numbers) {
    if (number <= 32) low |= 1 << (number - 1)
    else high |= 1 << (number - 33)
  }
  return [low, high]
}

function overlap(a: readonly number[], b: readonly number[]) {
  return popcount(a[0] & b[0]) + popcount(a[1] & b[1])
}

// 서로 다른 세 번호의 조합 순위: 0~14,189. 표를 직접 조회해 추첨별 번호 비교를 줄인다.
function tripleId(a: number, b: number, c: number) {
  return ((c - 1) * (c - 2) * (c - 3)) / 6 + ((b - 1) * (b - 2)) / 2 + a - 1
}

export function selectDispersion<T extends { numbers: readonly number[] }>(
  rankedCandidates: readonly T[], top: readonly T[], random: () => number, count = 10,
): T[] {
  const words = SAMPLE_COUNT / 32
  const tripleDraws = new Uint32Array(14_190 * words)
  for (let draw = 0; draw < SAMPLE_COUNT; draw += 1) {
    const numbers: number[] = []
    while (numbers.length < 6) {
      const number = 1 + Math.floor(random() * 45)
      if (!numbers.includes(number)) numbers.push(number)
    }
    numbers.sort((a, b) => a - b)
    for (let a = 0; a < 4; a += 1) for (let b = a + 1; b < 5; b += 1) for (let c = b + 1; c < 6; c += 1) {
      tripleDraws[tripleId(numbers[a], numbers[b], numbers[c]) * words + (draw >>> 5)] |= 1 << (draw & 31)
    }
  }

  const fillCoverage = (numbers: readonly number[], destination: Uint32Array, offset = 0) => {
    for (let a = 0; a < 4; a += 1) for (let b = a + 1; b < 5; b += 1) for (let c = b + 1; c < 6; c += 1) {
      const source = tripleId(numbers[a], numbers[b], numbers[c]) * words
      for (let word = 0; word < words; word += 1) destination[offset + word] |= tripleDraws[source + word]
    }
  }

  const covered = new Uint32Array(words)
  const exposure = new Uint8Array(46)
  const topMasks = top.map((candidate) => mask(candidate.numbers))
  for (const candidate of top) {
    fillCoverage(candidate.numbers, covered)
    for (const number of candidate.numbers) exposure[number] += 1
  }
  const uncovered = covered.map((word) => ~word)
  const stride = Math.max(1, Math.floor(rankedCandidates.length / CANDIDATE_COUNT))
  const candidates = rankedCandidates.filter((_, index) => index % stride === 0).slice(0, CANDIDATE_COUNT)
  const masks = candidates.map((candidate) => mask(candidate.numbers))
  const active = masks.map((candidate) => topMasks.every((chosen) => overlap(candidate, chosen) <= 2))
  const coverage = new Uint32Array(candidates.length * words)
  for (let i = 0; i < candidates.length; i += 1) {
    if (active[i]) fillCoverage(candidates[i].numbers, coverage, i * words)
  }

  const selected: T[] = []
  for (let game = 0; game < count; game += 1) {
    let best = -1
    let bestGain = -1
    let bestExposure = Infinity
    for (let i = 0; i < candidates.length; i += 1) {
      if (!active[i]) continue
      let gain = 0
      for (let word = 0; word < words; word += 1) gain += popcount(coverage[i * words + word] & uncovered[word])
      const repeated = candidates[i].numbers.reduce((sum, number) => sum + exposure[number], 0)
      // 같은 보완 효과에서는 번호 쏠림을 줄이고, 남은 동점은 패턴 점수 순서를 유지한다.
      if (gain > bestGain || (gain === bestGain && repeated < bestExposure)) {
        best = i
        bestGain = gain
        bestExposure = repeated
      }
    }
    if (best < 0) throw new Error('분산 조합을 만들 후보가 부족합니다.')
    selected.push(candidates[best])
    for (const number of candidates[best].numbers) exposure[number] += 1
    for (let word = 0; word < words; word += 1) uncovered[word] &= ~coverage[best * words + word]
    for (let i = 0; i < candidates.length; i += 1) {
      if (active[i] && overlap(masks[i], masks[best]) > 2) active[i] = false
    }
  }
  return selected
}

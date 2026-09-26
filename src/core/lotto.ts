// 고정수와 제외수 조건을 지키며 로또 번호 조합을 생성하는 핵심 로직
export type RandomSource = () => number

export interface GenerateOptions {
  count: number
  fixed?: readonly number[]
  excluded?: readonly number[]
  random?: RandomSource
}

const MIN_NUMBER = 1
const MAX_NUMBER = 45
const PICK_COUNT = 6

function assertValidNumber(value: number) {
  if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
    throw new Error(`번호는 ${MIN_NUMBER}부터 ${MAX_NUMBER} 사이의 정수여야 합니다.`)
  }
}

function unique(values: readonly number[]) {
  return [...new Set(values)]
}

export function secureRandom(): number {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1)
    globalThis.crypto.getRandomValues(value)
    return value[0] / 0x1_0000_0000
  }

  return Math.random()
}

function randomIndex(length: number, random: RandomSource) {
  return Math.min(length - 1, Math.floor(Math.max(0, random()) * length))
}

export function generateGame(options: Omit<GenerateOptions, 'count'>): number[] {
  const fixed = unique(options.fixed ?? [])
  const excluded = unique(options.excluded ?? [])
  const random = options.random ?? secureRandom

  fixed.forEach(assertValidNumber)
  excluded.forEach(assertValidNumber)

  if (fixed.length > PICK_COUNT) {
    throw new Error('고정수는 최대 6개까지 선택할 수 있습니다.')
  }

  const excludedSet = new Set(excluded)
  if (fixed.some((number) => excludedSet.has(number))) {
    throw new Error('같은 번호를 고정수와 제외수로 동시에 선택할 수 없습니다.')
  }

  const fixedSet = new Set(fixed)
  const pool = Array.from({ length: MAX_NUMBER }, (_, index) => index + 1).filter(
    (number) => !fixedSet.has(number) && !excludedSet.has(number),
  )
  const needed = PICK_COUNT - fixed.length

  if (pool.length < needed) {
    throw new Error('제외수가 너무 많아 6개 번호를 만들 수 없습니다.')
  }

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random)
    ;[pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]]
  }

  return [...fixed, ...pool.slice(0, needed)].sort((a, b) => a - b)
}

export function generateGames(options: GenerateOptions): number[][] {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 5) {
    throw new Error('게임 수는 1개부터 5개까지 선택할 수 있습니다.')
  }

  return Array.from({ length: options.count }, () => generateGame(options))
}

export function ballTone(number: number) {
  if (number <= 10) return 'yellow'
  if (number <= 20) return 'blue'
  if (number <= 30) return 'red'
  if (number <= 40) return 'grey'
  return 'green'
}

// 로또 6/45 번호대별 공 색상 톤을 정하는 모듈
export function ballTone(number: number) {
  if (number <= 10) return 'yellow'
  if (number <= 20) return 'blue'
  if (number <= 30) return 'red'
  if (number <= 40) return 'grey'
  return 'green'
}

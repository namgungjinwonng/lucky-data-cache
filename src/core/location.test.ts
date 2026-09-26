// 판매점 거리 계산과 가까운 순 정렬을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { distanceKm, nearestStores } from './location'

describe('판매점 거리', () => {
  it('같은 좌표의 거리는 0이다', () => {
    expect(distanceKm(37.5, 127, 37.5, 127)).toBe(0)
  })

  it('가까운 판매점을 거리순으로 정렬한다', () => {
    const stores = [
      { id: 'far', name: '먼 곳', address: '', phone: '', lat: 37.6, lon: 127 },
      { id: 'near', name: '가까운 곳', address: '', phone: '', lat: 37.501, lon: 127 },
    ]
    expect(nearestStores(stores, 37.5, 127, 1)[0].id).toBe('near')
  })
})

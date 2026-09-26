// 현재 위치와 판매점 좌표 사이의 거리를 계산하고 가까운 판매점을 정렬하는 모듈
import type { LotteryStore } from './history-data'

export interface NearbyStore extends LotteryStore {
  distanceKm: number
}

function radians(degrees: number) {
  return degrees * Math.PI / 180
}

export function distanceKm(lat: number, lon: number, targetLat: number, targetLon: number) {
  const earthRadiusKm = 6371
  const latitudeDelta = radians(targetLat - lat)
  const longitudeDelta = radians(targetLon - lon)
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(lat)) * Math.cos(radians(targetLat)) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function nearestStores(stores: LotteryStore[], lat: number, lon: number, limit = 20): NearbyStore[] {
  return stores
    .map((store) => ({ ...store, distanceKm: distanceKm(lat, lon, store.lat, store.lon) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

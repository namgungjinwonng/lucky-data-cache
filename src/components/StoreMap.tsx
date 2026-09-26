// 사용자의 현재 위치와 가까운 로또 판매점을 OpenStreetMap 지도와 목록으로 보여주는 컴포넌트
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { syncStores } from '../core/history-data'
import { nearestStores, type NearbyStore } from '../core/location'

interface Position {
  lat: number
  lon: number
}

export function StoreMap() {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [stores, setStores] = useState<NearbyStore[]>([])
  const [status, setStatus] = useState('위치 권한을 허용하면 가까운 판매점 20곳을 찾습니다.')
  const [loading, setLoading] = useState(false)

  const findNearby = () => {
    if (!navigator.geolocation) {
      setStatus('이 기기에서는 위치 기능을 사용할 수 없습니다.')
      return
    }
    setLoading(true)
    setStatus('현재 위치와 판매점 데이터를 확인하고 있습니다.')
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const dataset = await syncStores()
          const current = { lat: coords.latitude, lon: coords.longitude }
          setPosition(current)
          setStores(nearestStores(dataset.stores, current.lat, current.lon, 20))
          setStatus(`${dataset.stores.length.toLocaleString('ko-KR')}개 판매점에서 가까운 순으로 찾았습니다.`)
        } catch (error) {
          setStatus(error instanceof Error ? error.message : '판매점 데이터를 불러오지 못했습니다.')
        } finally {
          setLoading(false)
        }
      },
      (error) => {
        setLoading(false)
        setStatus(error.code === error.PERMISSION_DENIED ? '위치 권한이 필요합니다. 기기 설정에서 허용해주세요.' : '현재 위치를 확인하지 못했습니다.')
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 300_000 },
    )
  }

  useEffect(() => {
    if (!mapElement.current || !position || stores.length === 0) return
    mapInstance.current?.remove()
    const map = L.map(mapElement.current, { zoomControl: true }).setView([position.lat, position.lon], 14)
    mapInstance.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    L.circleMarker([position.lat, position.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#da291c', fillOpacity: 1 })
      .bindPopup('현재 위치')
      .addTo(map)
    stores.forEach((store, index) => {
      const marker = L.circleMarker([store.lat, store.lon], {
        radius: index < 5 ? 8 : 6,
        color: '#181818',
        weight: 2,
        fillColor: '#da291c',
        fillOpacity: 1,
      })
      marker.bindPopup(`<strong>${store.name}</strong><br>${store.address}<br>${store.distanceKm.toFixed(1)}km`)
      marker.addTo(map)
    })
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [position, stores])

  return (
    <div className="store-map-panel">
      <button className="start-button" type="button" onClick={findNearby} disabled={loading}>
        <span>{loading ? '위치 확인 중' : '내 위치로 판매점 찾기'}</span>
        <span aria-hidden="true">◎</span>
      </button>
      <p className="status-message" role="status">{status}</p>
      {position && <div className="store-map" ref={mapElement} aria-label="내 주변 로또 판매점 지도" />}
      {stores.length > 0 && (
        <div className="nearby-list">
          {stores.map((store, index) => (
            <article key={store.id}>
              <span className="nearby-list__rank">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{store.name}</h3>
                <p>{store.address}</p>
                {store.phone && <a href={`tel:${store.phone}`}>{store.phone}</a>}
              </div>
              <strong>{store.distanceKm < 1 ? `${Math.round(store.distanceKm * 1000)}m` : `${store.distanceKm.toFixed(1)}km`}</strong>
            </article>
          ))}
        </div>
      )}
      <p className="map-privacy">위치는 기기에서 거리 계산에만 사용됩니다. 지도 표시 시 OpenStreetMap 타일 서버에 현재 지도 영역이 요청됩니다.</p>
    </div>
  )
}
